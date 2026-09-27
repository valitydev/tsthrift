import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import {
  ThriftConnectionError,
  ThriftHttpError,
  ThriftProtocolError,
  ThriftTimeoutError,
  createHttpTransport,
  mergeHeaderProviders,
} from "../src/index.ts";

describe("HTTP transport", () => {
  let server: http.Server;
  let endpoint: string;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
      if (url.pathname === "/slow") {
        setTimeout(() => {
          res.writeHead(200, { "Content-Type": "application/x-thrift" });
          res.end(Buffer.from([0x01]));
        }, 300);
        return;
      }
      if (url.pathname === "/500") {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal Server Error occurred");
        return;
      }
      if (url.pathname === "/html-error") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body>Error</body></html>");
        return;
      }

      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        const auth = req.headers["authorization"] ?? "";
        const trace = req.headers["x-trace-id"] ?? "";
        const custom = req.headers["x-call-id"] ?? "";
        res.writeHead(200, {
          "Content-Type": "application/x-thrift",
          "x-echo-auth": String(auth),
          "x-echo-trace": String(trace),
          "x-echo-call": String(custom),
        });
        const body = Buffer.concat(chunks);
        res.end(body);
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address() as AddressInfo;
    endpoint = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  test("sends payload and receives binary response round-trip", async () => {
    const transport = createHttpTransport({ endpoint });
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    const response = await transport(payload);
    expect(response).toEqual(payload);
  });

  test("resolves dynamic headers on each request", async () => {
    let callCount = 0;
    const transport = createHttpTransport({
      endpoint,
      headers: async () => ({
        authorization: "Bearer secret-token",
        "x-trace-id": `trace-${++callCount}`,
      }),
    });

    const res1 = await transport(new Uint8Array([1]));
    expect(res1).toEqual(new Uint8Array([1]));
    expect(callCount).toBe(1);

    const res2 = await transport(new Uint8Array([2]));
    expect(res2).toEqual(new Uint8Array([2]));
    expect(callCount).toBe(2);
  });

  test("rejects immediately on HTTP 500 with ThriftHttpError and body", async () => {
    const transport = createHttpTransport({ endpoint: `${endpoint}/500` });
    await expect(transport(new Uint8Array([1]))).rejects.toThrow(ThriftHttpError);
    try {
      await transport(new Uint8Array([1]));
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(ThriftHttpError);
      const httpErr = err as ThriftHttpError;
      expect(httpErr.status).toBe(500);
      expect(httpErr.body).toContain("Internal Server Error");
    }
  });

  test("rejects non-thrift content-type with ThriftProtocolError", async () => {
    const transport = createHttpTransport({ endpoint: `${endpoint}/html-error` });
    await expect(transport(new Uint8Array([1]))).rejects.toThrow(ThriftProtocolError);
  });

  test("enforces timeout with ThriftTimeoutError", async () => {
    const transport = createHttpTransport({
      endpoint: `${endpoint}/slow`,
      timeoutMs: 50,
    });
    await expect(transport(new Uint8Array([1]))).rejects.toThrow(ThriftTimeoutError);
  });

  test("enforces per-call timeout override", async () => {
    const transport = createHttpTransport({
      endpoint: `${endpoint}/slow`,
      timeoutMs: 5000,
    });
    await expect(transport(new Uint8Array([1]), { timeoutMs: 50 })).rejects.toThrow(
      ThriftTimeoutError,
    );
  });

  test("aborts request when AbortSignal triggers", async () => {
    const transport = createHttpTransport({ endpoint: `${endpoint}/slow`, timeoutMs: 5000 });
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error("user canceled")), 30);
    await expect(transport(new Uint8Array([1]), { signal: controller.signal })).rejects.toThrow(
      "user canceled",
    );
  });

  test("rejects immediately if signal is already aborted", async () => {
    const transport = createHttpTransport({ endpoint });
    const controller = new AbortController();
    controller.abort(new Error("already stopped"));
    await expect(transport(new Uint8Array([1]), { signal: controller.signal })).rejects.toThrow(
      "already stopped",
    );
  });

  test("wraps connection failures in ThriftConnectionError", async () => {
    const transport = createHttpTransport({ endpoint: "http://127.0.0.1:1" });
    await expect(transport(new Uint8Array([1]))).rejects.toThrow(ThriftConnectionError);
  });

  test("service-level header provider receives global headers and derives headers per request", async () => {
    let globalCallCount = 0;
    let serviceCallCount = 0;

    const globalHeaders = () => ({
      Authorization: `Bearer token-${++globalCallCount}`,
      "x-root-trace": `trace-${globalCallCount}`,
    });

    const serviceHeaders = (baseHeaders: Record<string, string>) => ({
      "x-service-call": `service-${++serviceCallCount}`,
      "x-child-trace": `${baseHeaders["x-root-trace"]}-child`,
    });

    const transport = createHttpTransport({
      endpoint,
      headers: mergeHeaderProviders(globalHeaders, serviceHeaders),
    });

    const res1 = await transport(new Uint8Array([42]));
    expect(res1).toEqual(new Uint8Array([42]));
    expect(globalCallCount).toBe(1);
    expect(serviceCallCount).toBe(1);

    const res2 = await transport(new Uint8Array([43]));
    expect(res2).toEqual(new Uint8Array([43]));
    expect(globalCallCount).toBe(2);
    expect(serviceCallCount).toBe(2);
  });

  test("mergeHeaderProviders correctly cascades base headers to extra header provider", async () => {
    const baseProvider = async () => ({
      Authorization: "Bearer global-jwt",
      "x-root-trace": "trace-global",
    });

    const extraProvider = async (baseHeaders: Record<string, string>) => ({
      "x-service-name": "payment",
      "x-child-trace": `${baseHeaders["x-root-trace"]}-child`,
    });

    const merged = mergeHeaderProviders(baseProvider, extraProvider);
    expect(merged).toBeDefined();

    const result = typeof merged === "function" ? await merged({}) : merged;
    expect(result).toEqual({
      Authorization: "Bearer global-jwt",
      "x-root-trace": "trace-global",
      "x-service-name": "payment",
      "x-child-trace": "trace-global-child",
    });
  });
});
