import "@angular/compiler";
import { HttpBackend, HttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { type EnvironmentInjector, createEnvironmentInjector } from "@angular/core";
import { expect, test } from "vite-plus/test";
import { ThriftTimeoutError, createHttpTransport } from "@vality/tsthrift";
import { createHttpClientFetch } from "../src/http-client-fetch.ts";

async function pendingRequest(http: HttpTestingController) {
  // Request body conversion is asynchronous; wait for HttpClient subscription.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return http.expectOne("https://example.invalid/thrift");
}

test("real Angular HttpClient serializes binary and preserves backend HTTP errors", async () => {
  const injector = createEnvironmentInjector(
    [provideHttpClientTesting()],
    null as unknown as EnvironmentInjector,
  );
  const http = injector.get(HttpTestingController);
  try {
    const transport = createHttpTransport({
      endpoint: "https://example.invalid/thrift",
      fetch: createHttpClientFetch(new HttpClient(injector.get(HttpBackend))),
    });
    const call = transport(new Uint8Array([0, 128, 255]));
    const request = await pendingRequest(http);
    expect(request.request.serializeBody()).toBeInstanceOf(ArrayBuffer);
    expect([...new Uint8Array(request.request.serializeBody() as ArrayBuffer)]).toEqual([
      0, 128, 255,
    ]);
    request.flush(new Uint8Array([42]).buffer);
    expect(await call).toEqual(new Uint8Array([42]));

    const failure = transport(new Uint8Array());
    const rejected = expect(failure).rejects.toMatchObject({ status: 503, body: "retry" });
    (await pendingRequest(http)).flush(new TextEncoder().encode("retry").buffer, {
      status: 503,
      statusText: "Unavailable",
    });
    await rejected;
    http.verify();
  } finally {
    injector.destroy();
  }
});

test("real Angular HttpClient cancels the backend subscription on timeout", async () => {
  const injector = createEnvironmentInjector(
    [provideHttpClientTesting()],
    null as unknown as EnvironmentInjector,
  );
  const http = injector.get(HttpTestingController);
  try {
    const transport = createHttpTransport({
      endpoint: "https://example.invalid/thrift",
      timeoutMs: 30,
      fetch: createHttpClientFetch(new HttpClient(injector.get(HttpBackend))),
    });
    const rejected = expect(transport(new Uint8Array())).rejects.toBeInstanceOf(ThriftTimeoutError);
    const request = await pendingRequest(http);
    await rejected;
    expect(request.cancelled).toBe(true);
    http.verify();
  } finally {
    injector.destroy();
  }
});
