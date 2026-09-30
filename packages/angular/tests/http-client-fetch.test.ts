import { expect, test, vi } from "vite-plus/test";
import { EMPTY, Observable, of, throwError } from "rxjs";
import {
  ThriftConnectionError,
  ThriftHttpError,
  ThriftTimeoutError,
  createHttpTransport,
} from "@vality/tsthrift";
import { createHttpClientFetch } from "../src/http-client-fetch.ts";

const endpoint = "https://example.invalid/thrift";
const payload = new Uint8Array([0, 128, 255]);

test("sends raw ArrayBuffer bytes including view offsets", async () => {
  const request = vi.fn((_method, _url, options) => {
    expect(options.body).toBeInstanceOf(ArrayBuffer);
    expect([...new Uint8Array(options.body)]).toEqual([128, 255]);
    return of({ status: 200, body: options.body });
  });
  const transport = createHttpTransport({ endpoint, fetch: createHttpClientFetch({ request }) });
  expect(await transport(payload.subarray(1))).toEqual(payload.subarray(1));
});

test("preserves backend HTTP status and body while distinguishing network failures", async () => {
  const httpFailure = {
    status: 503,
    statusText: "Unavailable",
    error: new TextEncoder().encode("retry").buffer,
  };
  const transport = createHttpTransport({
    endpoint,
    fetch: createHttpClientFetch({ request: () => throwError(() => httpFailure) }),
  });
  await expect(transport(payload)).rejects.toMatchObject({ status: 503, body: "retry" });
  await expect(transport(payload)).rejects.toBeInstanceOf(ThriftHttpError);
  const network = createHttpTransport({
    endpoint,
    fetch: createHttpClientFetch({ request: () => throwError(() => ({ status: 0 })) }),
  });
  await expect(network(payload)).rejects.toBeInstanceOf(ThriftConnectionError);
});

test("timeout unsubscribes a never-ending Angular request", async () => {
  vi.useFakeTimers();
  try {
    const teardown = vi.fn();
    let started!: () => void;
    const subscribed = new Promise<void>((resolve) => {
      started = resolve;
    });
    const transport = createHttpTransport({
      endpoint,
      timeoutMs: 1000,
      fetch: createHttpClientFetch({
        request: () =>
          new Observable(() => {
            started();
            return teardown;
          }),
      }),
    });
    const rejected = expect(transport(payload)).rejects.toBeInstanceOf(ThriftTimeoutError);
    await subscribed;
    await vi.advanceTimersByTimeAsync(1000);
    await rejected;
    expect(teardown).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});

test("empty completion and invalid response reject without hanging", async () => {
  await expect(createHttpClientFetch({ request: () => EMPTY })(endpoint)).rejects.toThrow();
  await expect(
    createHttpClientFetch({ request: () => of({ status: 0 }) })(endpoint),
  ).rejects.toThrow();
});
