import { describe, expect, test, vi } from "vite-plus/test";
import {
  WOODY_HEADERS,
  createWoodyHeaders,
  createWoodyHeaderProvider,
  generateTraceId,
  createHttpTransport,
} from "../src/index.ts";

describe("Woody headers", () => {
  test("generateTraceId produces a valid v4 UUID format", () => {
    const id = generateTraceId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  test("createWoodyHeaders creates default trace-id and span-id", () => {
    const headers = createWoodyHeaders();
    expect(headers[WOODY_HEADERS.TRACE_ID]).toBeDefined();
    expect(headers[WOODY_HEADERS.SPAN_ID]).toBe(headers[WOODY_HEADERS.TRACE_ID]);
    expect(headers[WOODY_HEADERS.PARENT_ID]).toBeUndefined();
    expect(headers[WOODY_HEADERS.FLAGS]).toBeUndefined();
  });

  test("createWoodyHeaders accepts custom traceId, spanId, parentId, and flags", () => {
    const headers = createWoodyHeaders({
      traceId: "custom-trace-1",
      spanId: "custom-span-2",
      parentId: "parent-0",
      flags: 1,
    });
    expect(headers[WOODY_HEADERS.TRACE_ID]).toBe("custom-trace-1");
    expect(headers[WOODY_HEADERS.SPAN_ID]).toBe("custom-span-2");
    expect(headers[WOODY_HEADERS.PARENT_ID]).toBe("parent-0");
    expect(headers[WOODY_HEADERS.FLAGS]).toBe("1");
  });

  test("createWoodyHeaders accepts generator functions for traceId and spanId", () => {
    let count = 0;
    const headers = createWoodyHeaders({
      traceId: () => `trace-${++count}`,
      spanId: () => `span-${++count}`,
    });
    expect(headers[WOODY_HEADERS.TRACE_ID]).toBe("trace-1");
    expect(headers[WOODY_HEADERS.SPAN_ID]).toBe("span-2");
  });

  test("createWoodyHeaders formats deadline properly from Date, number, and string", () => {
    const date = new Date("2026-10-01T12:00:00.000Z");
    const headersDate = createWoodyHeaders({ deadline: date });
    expect(headersDate[WOODY_HEADERS.DEADLINE]).toBe("2026-10-01T12:00:00.000Z");

    const headersNum = createWoodyHeaders({ deadline: date.getTime() });
    expect(headersNum[WOODY_HEADERS.DEADLINE]).toBe("2026-10-01T12:00:00.000Z");

    const headersStr = createWoodyHeaders({ deadline: "2026-10-01T12:00:00.000Z" });
    expect(headersStr[WOODY_HEADERS.DEADLINE]).toBe("2026-10-01T12:00:00.000Z");
  });

  test("createWoodyHeaders prefixes meta keys and omits null/undefined", () => {
    const headers = createWoodyHeaders({
      meta: {
        "user-identity-id": "usr-123",
        "user-identity-email": "usr@example.com",
        "user-identity-realm": "internal",
        "optional-empty": undefined,
        "null-field": null,
      },
    });
    expect(headers["x-woody-meta-user-identity-id"]).toBe("usr-123");
    expect(headers["x-woody-meta-user-identity-email"]).toBe("usr@example.com");
    expect(headers["x-woody-meta-user-identity-realm"]).toBe("internal");
    expect(headers["x-woody-meta-optional-empty"]).toBeUndefined();
    expect(headers["x-woody-meta-null-field"]).toBeUndefined();
  });

  test("createWoodyHeaderProvider creates fresh headers and merges base headers", () => {
    const provider = createWoodyHeaderProvider({
      parentId: "root-parent",
    });

    const call1 = provider({ authorization: "Bearer token1" });
    const call2 = provider({ authorization: "Bearer token2" });

    expect(call1.authorization).toBe("Bearer token1");
    expect(call2.authorization).toBe("Bearer token2");
    expect(call1[WOODY_HEADERS.PARENT_ID]).toBe("root-parent");
    expect(call2[WOODY_HEADERS.PARENT_ID]).toBe("root-parent");
    expect(call1[WOODY_HEADERS.TRACE_ID]).toBeDefined();
    expect(call2[WOODY_HEADERS.TRACE_ID]).toBeDefined();
    expect(call1[WOODY_HEADERS.TRACE_ID]).not.toBe(call2[WOODY_HEADERS.TRACE_ID]);
  });

  test("createHttpTransport automatically injects Woody headers when woody: true", async () => {
    let capturedHeaders: Record<string, string> = {};
    const mockFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return {
        status: 200,
        headers: new Headers({ "content-type": "application/x-thrift" }),
        arrayBuffer: async () => new ArrayBuffer(0),
      } as unknown as Response;
    });

    const transport = createHttpTransport({
      endpoint: "http://localhost:8080/rpc",
      woody: true,
      timeoutMs: 5000,
      fetch: mockFetch as unknown as typeof fetch,
    });

    await transport(new Uint8Array([1, 2, 3]));

    expect(capturedHeaders[WOODY_HEADERS.TRACE_ID]).toBeDefined();
    expect(capturedHeaders[WOODY_HEADERS.SPAN_ID]).toBe(capturedHeaders[WOODY_HEADERS.TRACE_ID]);
    expect(capturedHeaders[WOODY_HEADERS.DEADLINE]).toBeDefined();
    expect(capturedHeaders["Content-Type"]).toBe("application/x-thrift");
  });

  test("createHttpTransport preserves user-provided trace-id when woody is enabled", async () => {
    let capturedHeaders: Record<string, string> = {};
    const mockFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return {
        status: 200,
        headers: new Headers({ "content-type": "application/x-thrift" }),
        arrayBuffer: async () => new ArrayBuffer(0),
      } as unknown as Response;
    });

    const transport = createHttpTransport({
      endpoint: "http://localhost:8080/rpc",
      woody: {
        meta: { "user-identity-id": "123" },
      },
      fetch: mockFetch as unknown as typeof fetch,
    });

    await transport(new Uint8Array([1, 2, 3]), {
      headers: {
        [WOODY_HEADERS.TRACE_ID]: "explicit-trace-id",
      },
    });

    expect(capturedHeaders[WOODY_HEADERS.TRACE_ID]).toBe("explicit-trace-id");
    expect(capturedHeaders["x-woody-meta-user-identity-id"]).toBe("123");
  });
});
