import { describe, expect, test, vi } from "vite-plus/test";
import {
  FlakeId,
  WOODY_HEADERS,
  bs64,
  createHttpTransport,
  createWachterHeaders,
  createWoodyHeaderProvider,
  createWoodyHeaders,
  generateId,
  generateTraceId,
  resolveWoodyHeaders,
} from "../src/index.ts";

describe("Woody headers", () => {
  test("generateId produces a valid base64-encoded 64-bit Flake ID", () => {
    const id = generateId();
    expect(generateTraceId).toBe(generateId);
    expect(typeof id).toBe("string");
    // 64-bit Big-Endian number encoded in base-64 has 11 chars
    expect(id.length).toBe(11);
    expect(id).toMatch(/^[A-Za-z0-9+/]{11}$/);

    const decoded = bs64.decode(id);
    expect(decoded.length).toBe(8);
  });

  test("generateId generates unique, monotonically increasing IDs", () => {
    const ids = Array.from({ length: 100 }, () => generateId());
    const unique = new Set(ids);
    expect(unique.size).toBe(100);
  });

  test("matches upstream flake-idgen output byte-for-byte and string-for-string", async () => {
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const FlakeIdOfficial = require("flake-idgen");
    const flakeOfficial = new FlakeIdOfficial();
    const flakeNative = new FlakeId();

    const fixedTime = 1727465790000;
    const origNow = Date.now;
    Date.now = () => fixedTime;

    try {
      for (let i = 0; i < 50; i++) {
        const buf1 = flakeOfficial.next();
        const buf2 = flakeNative.next();
        expect(bs64.encode(buf1)).toBe(bs64.encode(buf2));
      }
    } finally {
      Date.now = origNow;
    }
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

  test("createWoodyHeaders supports custom metaPrefix and nested meta maps", () => {
    const headers = createWoodyHeaders({
      metaPrefix: "x-woody-meta-custom-",
      meta: {
        "user-identity": {
          id: "usr-456",
          nested: {
            flag: true,
          },
        },
        simple: "value",
      },
    });
    expect(headers["x-woody-meta-custom-user-identity-id"]).toBe("usr-456");
    expect(headers["x-woody-meta-custom-user-identity-nested-flag"]).toBe("true");
    expect(headers["x-woody-meta-custom-simple"]).toBe("value");
  });

  test("createWoodyHeaders supports custom prefix and metaPrefix", () => {
    const headers = createWoodyHeaders({
      prefix: "x-custom-woody-",
      metaPrefix: "x-custom-meta-",
      parentId: "parent-99",
      flags: 1,
      meta: { key: "val" },
    });
    expect(headers["x-custom-woody-trace-id"]).toBeDefined();
    expect(headers["x-custom-woody-span-id"]).toBe(headers["x-custom-woody-trace-id"]);
    expect(headers["x-custom-woody-parent-id"]).toBe("parent-99");
    expect(headers["x-custom-woody-flags"]).toBe("1");
    expect(headers["x-custom-meta-key"]).toBe("val");
    expect(headers[WOODY_HEADERS.TRACE_ID]).toBeUndefined();
  });

  test("createWoodyHeaderProvider creates fresh headers and merges base headers", async () => {
    const provider = createWoodyHeaderProvider({
      parentId: "root-parent",
      meta: async () => ({
        user: { id: "async-user-1" },
      }),
    });

    const call1 = await provider({ authorization: "Bearer token1" });
    const call2 = await provider({ authorization: "Bearer token2" });

    expect(call1.authorization).toBe("Bearer token1");
    expect(call2.authorization).toBe("Bearer token2");
    expect(call1["x-woody-meta-user-id"]).toBe("async-user-1");
    expect(call1[WOODY_HEADERS.PARENT_ID]).toBe("root-parent");
    expect(call2[WOODY_HEADERS.PARENT_ID]).toBe("root-parent");
    expect(call1[WOODY_HEADERS.TRACE_ID]).toBeDefined();
    expect(call2[WOODY_HEADERS.TRACE_ID]).toBeDefined();
    expect(call1[WOODY_HEADERS.TRACE_ID]).not.toBe(call2[WOODY_HEADERS.TRACE_ID]);
  });

  test("createHttpTransport integrates with createWoodyHeaders in headers provider", async () => {
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
      headers: () => createWoodyHeaders(),
      timeoutMs: 5000,
      fetch: mockFetch as unknown as typeof fetch,
    });

    await transport(new Uint8Array([1, 2, 3]));

    expect(capturedHeaders[WOODY_HEADERS.TRACE_ID]).toBeDefined();
    expect(capturedHeaders[WOODY_HEADERS.SPAN_ID]).toBe(capturedHeaders[WOODY_HEADERS.TRACE_ID]);
    expect(capturedHeaders["Content-Type"]).toBe("application/x-thrift");
  });
});

describe("Wachter headers", () => {
  test("createWachterHeaders returns empty object when no config provided", () => {
    const headers = createWachterHeaders();
    expect(headers).toEqual({});
  });

  test("createWachterHeaders adds service, token, and user identity metadata", () => {
    const headers = createWachterHeaders({
      service: "Repository",
      token: "secret-token",
      user: {
        id: "usr-42",
        email: "alice@example.com",
        username: "alice",
      },
    });

    expect(headers.service).toBe("Repository");
    expect(headers.authorization).toBe("Bearer secret-token");
    expect(headers["x-woody-meta-user-identity-id"]).toBe("usr-42");
    expect(headers["x-woody-meta-user-identity-email"]).toBe("alice@example.com");
    expect(headers["x-woody-meta-user-identity-username"]).toBe("alice");
    expect(headers["x-woody-meta-user-identity-realm"]).toBe("internal");
  });

  test("createWachterHeaders preserves existing Bearer prefix in token and custom realm", () => {
    const headers = createWachterHeaders({
      token: "Bearer existing-bearer-token",
      user: {
        id: "usr-99",
        realm: "external-sso",
      },
    });
    expect(headers.authorization).toBe("Bearer existing-bearer-token");
    expect(headers["x-woody-meta-user-identity-realm"]).toBe("external-sso");
  });

  test("createWachterHeaders supports custom serviceHeader and userPrefix", () => {
    const headers = createWachterHeaders({
      service: "BillingService",
      serviceHeader: "x-target-service",
      userPrefix: "x-custom-identity-",
      user: {
        id: "usr-1",
        customProp: "special",
      },
    });

    expect(headers["x-target-service"]).toBe("BillingService");
    expect(headers["x-custom-identity-id"]).toBe("usr-1");
    expect(headers["x-custom-identity-realm"]).toBe("internal");
    expect(headers["x-custom-identity-customProp"]).toBe("special");
  });

  test("createHttpTransport integrates with combined createWoodyHeaders and createWachterHeaders", async () => {
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
      headers: () => ({
        ...createWoodyHeaders(),
        ...createWachterHeaders({
          service: "TestService",
          token: "jwt-token",
          user: { id: "u-1" },
        }),
      }),
      fetch: mockFetch as unknown as typeof fetch,
    });

    await transport(new Uint8Array([1, 2, 3]));

    expect(capturedHeaders.service).toBe("TestService");
    expect(capturedHeaders.authorization).toBe("Bearer jwt-token");
    expect(capturedHeaders[WOODY_HEADERS.TRACE_ID]).toBeDefined();
    expect(capturedHeaders[WOODY_HEADERS.SPAN_ID]).toBe(capturedHeaders[WOODY_HEADERS.TRACE_ID]);
    expect(capturedHeaders["x-woody-meta-user-identity-id"]).toBe("u-1");
  });
});

test("resolves a metadata provider once and propagates its rejection", async () => {
  let calls = 0;
  const headers = await resolveWoodyHeaders({ meta: async () => ({ attempt: ++calls }) });
  expect(calls).toBe(1);
  expect(headers["x-woody-meta-attempt"]).toBe("1");
  const failure = new Error("metadata unavailable");
  await expect(
    resolveWoodyHeaders({
      meta: async () => {
        calls++;
        throw failure;
      },
    }),
  ).rejects.toBe(failure);
  expect(calls).toBe(2);
});
