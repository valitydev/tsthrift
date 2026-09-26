import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import {
  ThriftConnectionError,
  ThriftHttpError,
  ThriftProtocolError,
  ThriftTimeoutError,
  createHttpTransport,
} from "../src/transport/index.ts";

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

  test("resolves static and dynamic headers, plus per-call overrides", async () => {
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

    const res2 = await transport(new Uint8Array([2]), {
      headers: { "x-call-id": "custom-call-99" },
    });
    expect(res2).toEqual(new Uint8Array([2]));
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
});
