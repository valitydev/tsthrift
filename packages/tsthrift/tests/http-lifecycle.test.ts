import { expect, test, vi } from "vite-plus/test";
import {
  createHttpTransport,
  mergeHeaderProviders,
  ThriftTimeoutError,
  ThriftProtocolError,
  toBinary,
} from "../src/index.ts";

const endpoint = "https://example.invalid/thrift";
const payload = new Uint8Array([1]);

test("overrides HTTP headers case-insensitively across providers and calls", async () => {
  const fetch = vi.fn(async (_input: any, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("call");
    expect(headers.get("content-type")).toBe("application/octet-stream");
    return new Response(payload);
  });
  const headers = mergeHeaderProviders({ Authorization: "base" }, () => ({
    authorization: "service",
  }));
  expect(typeof headers === "function" && (await headers({}))).toEqual({
    authorization: "service",
  });
  await createHttpTransport({ endpoint, fetch, headers })(payload, {
    headers: { AUTHORIZATION: "call", "content-type": "application/octet-stream" },
  });
});

test("timeout includes stalled header resolution and prevents a late request", async () => {
  let resolve!: (headers: Record<string, string>) => void;
  const fetch = vi.fn();
  const transport = createHttpTransport({
    endpoint,
    fetch,
    timeoutMs: 5,
    headers: () =>
      new Promise<Record<string, string>>((r) => {
        resolve = r;
      }),
  });
  await expect(transport(payload)).rejects.toBeInstanceOf(ThriftTimeoutError);
  resolve({});
  await Promise.resolve();
  expect(fetch).not.toHaveBeenCalled();
});

test("caller cancellation settles during preparation and skips already-aborted providers", async () => {
  const headers = vi.fn(() => new Promise<Record<string, string>>(() => {}));
  const transport = createHttpTransport({ endpoint, headers });
  const controller = new AbortController();
  const call = transport(payload, { signal: controller.signal });
  controller.abort(new Error("cancel"));
  await expect(call).rejects.toThrow("cancel");
  await expect(transport(payload, { signal: controller.signal })).rejects.toThrow("cancel");
  expect(headers).toHaveBeenCalledTimes(1);
});

test("timeout settles even when an injected fetch ignores AbortSignal", async () => {
  await expect(
    createHttpTransport({ endpoint, timeoutMs: 5, fetch: () => new Promise(() => {}) })(payload),
  ).rejects.toBeInstanceOf(ThriftTimeoutError);
});

test("rejects oversized streamed responses and cancels the stream", async () => {
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(9 * 1024 * 1024));
    },
    cancel() {
      cancelled = true;
    },
  });
  await expect(
    createHttpTransport({ endpoint, fetch: async () => new Response(body) })(payload),
  ).rejects.toBeInstanceOf(ThriftProtocolError);
  expect(cancelled).toBe(true);
});

test.each(["1g", "gg", "0x", "z1"])("rejects malformed hex %s", (hex) => {
  expect(() => toBinary(hex, "hex")).toThrow("Invalid hex");
});
