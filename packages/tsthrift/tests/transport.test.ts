import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import {
  ThriftApplicationError,
  ThriftConnectionError,
  ThriftHttpError,
  ThriftProtocolError,
  ThriftServiceError,
  ThriftTimeoutError,
  catchServiceError,
  catchSystemError,
  createHttpTransport,
  isThriftServiceError,
  isThriftSystemError,
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

  describe("error catch helpers", () => {
    const serviceError = new ThriftServiceError("InvalidAmount", "invalidAmount", {
      reason: "Below minimum",
      min: 100,
    });
    const httpError = new ThriftHttpError(500, "Internal Server Error");
    const timeoutError = new ThriftTimeoutError(3000);
    const connError = new ThriftConnectionError("Connection refused");
    const protoError = new ThriftProtocolError("Corrupted frame");
    const appError = new ThriftApplicationError("Unknown method", 1);
    const genericError = new Error("Something else");

    test("isThriftServiceError identifies service errors and matches type name", () => {
      expect(isThriftServiceError(serviceError)).toBe(true);
      expect(isThriftServiceError(serviceError, "InvalidAmount")).toBe(true);
      expect(isThriftServiceError(serviceError, "OtherError")).toBe(false);
      expect(isThriftServiceError(httpError)).toBe(false);
      expect(isThriftServiceError(genericError)).toBe(false);
    });

    test("catchServiceError invokes handler when error matches and returns result", () => {
      const handled = catchServiceError(serviceError, (err) => {
        expect(err.type).toBe("InvalidAmount");
        expect((err.data as any).min).toBe(100);
        return "handled-amount";
      });
      expect(handled).toBe("handled-amount");

      const handledWithType = catchServiceError(serviceError, "InvalidAmount", (err) => {
        return `handled-${err.type}`;
      });
      expect(handledWithType).toBe("handled-InvalidAmount");

      const nonMatchingType = catchServiceError(serviceError, "CustomerNotFound", () => "nope");
      expect(nonMatchingType).toBeUndefined();

      const ignoredHttp = catchServiceError(httpError, () => "fail");
      expect(ignoredHttp).toBeUndefined();
    });

    test("isThriftSystemError identifies all system failure types", () => {
      expect(isThriftSystemError(httpError)).toBe(true);
      expect(isThriftSystemError(timeoutError)).toBe(true);
      expect(isThriftSystemError(connError)).toBe(true);
      expect(isThriftSystemError(protoError)).toBe(true);
      expect(isThriftSystemError(appError)).toBe(true);
      expect(isThriftSystemError(serviceError)).toBe(false);
      expect(isThriftSystemError(genericError)).toBe(false);
    });

    test("catchSystemError handles system errors and returns result", () => {
      const handledHttp = catchSystemError(httpError, (err) => `http-${err.name}`);
      expect(handledHttp).toBe("http-ThriftHttpError");

      const handledTimeout = catchSystemError(timeoutError, (err) => `timeout-${err.name}`);
      expect(handledTimeout).toBe("timeout-ThriftTimeoutError");

      const handledApp = catchSystemError(appError, (err) => `app-${err.name}`);
      expect(handledApp).toBe("app-ThriftApplicationError");

      const ignoredService = catchSystemError(serviceError, () => "not-system");
      expect(ignoredService).toBeUndefined();

      const ignoredGeneric = catchSystemError(genericError, () => "not-thrift");
      expect(ignoredGeneric).toBeUndefined();
    });

    test("isSystem and isService flags discriminate error categories", () => {
      expect(serviceError.isService).toBe(true);
      expect(serviceError.isSystem).toBe(false);

      expect(httpError.isService).toBe(false);
      expect(httpError.isSystem).toBe(true);

      expect(timeoutError.isService).toBe(false);
      expect(timeoutError.isSystem).toBe(true);

      expect(connError.isService).toBe(false);
      expect(connError.isSystem).toBe(true);

      expect(protoError.isService).toBe(false);
      expect(protoError.isSystem).toBe(true);

      expect(appError.isService).toBe(false);
      expect(appError.isSystem).toBe(true);
    });
  });

  describe("dynamic endpoint and serviceHeader", () => {
    test("resolves dynamic endpoint factory", async () => {
      let fetchCalledWith = "";
      const customFetch = (async (url: string) => {
        fetchCalledWith = url;
        return new Response(new Uint8Array([0, 0, 0, 0]), {
          status: 200,
          headers: { "Content-Type": "application/x-thrift" },
        });
      }) as unknown as typeof fetch;

      const transport = createHttpTransport({
        endpoint: async () => "https://api.example.com/dynamic-path",
        fetch: customFetch,
      });

      await transport(new Uint8Array([1, 2, 3]));
      expect(fetchCalledWith).toBe("https://api.example.com/dynamic-path");
    });

    test("adds service header when serviceHeader is enabled", async () => {
      let sentHeaders: Record<string, string> = {};
      const customFetch = (async (_url: string, init: any) => {
        sentHeaders = init.headers;
        return new Response(new Uint8Array([0, 0, 0, 0]), {
          status: 200,
          headers: { "Content-Type": "application/x-thrift" },
        });
      }) as unknown as typeof fetch;

      const transport = createHttpTransport({
        endpoint: "https://api.example.com/wachter",
        serviceName: "PaymentProcessing",
        serviceHeader: true,
        fetch: customFetch,
      });

      await transport(new Uint8Array([1, 2, 3]));
      expect(sentHeaders["service"]).toBe("PaymentProcessing");

      // Custom header name
      const transportCustom = createHttpTransport({
        endpoint: "https://api.example.com/wachter",
        serviceName: "PaymentProcessing",
        serviceHeader: "x-custom-service",
        fetch: customFetch,
      });

      await transportCustom(new Uint8Array([1, 2, 3]));
      expect(sentHeaders["x-custom-service"]).toBe("PaymentProcessing");
    });
  });
});
