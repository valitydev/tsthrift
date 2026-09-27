import { describe, expect, test } from "vite-plus/test";
import { createEnvironmentInjector, inject, Injector, runInInjectionContext } from "@angular/core";
import { catchError, firstValueFrom, of } from "rxjs";
import {
  ThriftHttpError,
  ThriftServiceError,
  catchServiceError,
  catchSystemError,
  type ThriftServiceDescriptor,
} from "@vality/tsthrift";
import {
  THRIFT_CONFIG,
  THRIFT_SERVICES_REGISTRY,
  createHttpClientFetch,
  createServiceToken,
  deferThriftCall,
  getServiceToken,
  provideThriftConfig,
  provideThriftService,
  provideThriftServices,
  toObservableClient,
  type AngularHttpClientLike,
} from "../src/index.ts";

describe("Angular Thrift DI integration", () => {
  interface TestServiceClient {
    echo(msg: string): Promise<string>;
    config?: any;
  }

  const dummyDescriptor: ThriftServiceDescriptor<TestServiceClient> = {
    serviceName: "TestService",
    namespace: "test",
    createService: (config?: any) => ({
      echo: async (msg: string) => `[${config?.endpoint ?? "default"}] ${msg}`,
      config,
    }),
    getMetadata: async () => [],
  };

  test("getServiceToken returns stable InjectionToken", () => {
    const token1 = getServiceToken(dummyDescriptor);
    const token2 = getServiceToken(dummyDescriptor);
    const token3 = createServiceToken(dummyDescriptor);

    expect(token1).toBe(token2);
    expect(token1).toBe(token3);
    expect(token1.toString()).toContain("test.TestService");
  });

  test("provideThriftConfig provides static configuration", () => {
    const injector = Injector.create({
      providers: [provideThriftConfig({ endpoint: "http://example.com/api" })],
    });

    runInInjectionContext(injector, () => {
      const config = inject(THRIFT_CONFIG);
      expect(config?.endpoint).toBe("http://example.com/api");
    });
  });

  test("supports dynamic configuration with standard Angular useFactory", () => {
    let callCount = 0;
    const injector = Injector.create({
      providers: [
        {
          provide: THRIFT_CONFIG,
          useFactory: () => {
            callCount++;
            return { endpoint: `http://example.com/dynamic-${callCount}` };
          },
        },
      ],
    });

    runInInjectionContext(injector, () => {
      const config = inject(THRIFT_CONFIG);
      expect(config?.endpoint).toBe("http://example.com/dynamic-1");
    });
  });

  test("provideThriftServices registers service registry and client instances using createService", async () => {
    const envInjector = createEnvironmentInjector(
      [
        provideThriftConfig({ endpoint: "http://example.com/configured" }),
        provideThriftServices([dummyDescriptor]),
      ],
      null as unknown as any,
    );

    await runInInjectionContext(envInjector, async () => {
      const config = envInjector.get(THRIFT_CONFIG);
      expect(config).toEqual({ endpoint: "http://example.com/configured" });

      const registry = envInjector.get(THRIFT_SERVICES_REGISTRY);
      expect(registry.has("TestService")).toBe(true);
      expect(registry.has("test.TestService")).toBe(true);

      const clientByToken = inject(getServiceToken(dummyDescriptor));
      const res = await firstValueFrom(clientByToken.echo("native-token"));
      expect(res).toBe("[http://example.com/configured] native-token");
    });
  });

  test("provideThriftService registers individual service with custom config override", async () => {
    const envInjector = createEnvironmentInjector(
      [
        provideThriftConfig({ endpoint: "http://example.com/base" }),
        provideThriftService(dummyDescriptor, { endpoint: "http://example.com/override" }),
      ],
      null as unknown as any,
    );

    await runInInjectionContext(envInjector, async () => {
      const client = inject(getServiceToken(dummyDescriptor));
      const res = await firstValueFrom(client.echo("hello"));
      expect(res).toBe("[http://example.com/override] hello");
    });
  });

  test("provideThriftService merges global and service headers cascading base headers", async () => {
    const envInjector = createEnvironmentInjector(
      [
        provideThriftConfig({
          endpoint: "http://example.com/base",
          headers: () => ({ Authorization: "Bearer global-token" }),
        }),
        provideThriftService(dummyDescriptor, {
          headers: (baseHeaders: Record<string, string>) => ({
            "x-service": "test-service",
            "x-auth-copy": baseHeaders["Authorization"],
          }),
        }),
      ],
      null as unknown as any,
    );

    await runInInjectionContext(envInjector, async () => {
      const client = inject(getServiceToken(dummyDescriptor));
      const headersProvider = client.config?.headers;
      expect(headersProvider).toBeDefined();

      const resolved =
        typeof headersProvider === "function" ? await headersProvider() : headersProvider;

      expect(resolved).toEqual({
        Authorization: "Bearer global-token",
        "x-service": "test-service",
        "x-auth-copy": "Bearer global-token",
      });
    });
  });

  test("createHttpClientFetch adapts Angular HttpClient to fetch Response", async () => {
    let requestedUrl = "";
    let requestedHeaders: Record<string, string> | undefined;

    const mockHttpClient: AngularHttpClientLike = {
      request: (_method, url, options) => {
        requestedUrl = url;
        requestedHeaders = options.headers;
        return of({
          status: 200,
          statusText: "OK",
          body: new TextEncoder().encode("thrift-response-payload").buffer,
          headers: {
            keys: () => ["content-type", "x-trace-id"],
            get: (key: string) =>
              key === "content-type"
                ? "application/x-thrift"
                : key === "x-trace-id"
                  ? "trace-123"
                  : null,
          },
        });
      },
    };

    const adaptedFetch = createHttpClientFetch(mockHttpClient);
    const response = await adaptedFetch("http://example.com/thrift", {
      method: "POST",
      headers: { "X-Custom": "custom-val" },
      body: new Uint8Array([1, 2, 3]),
    });

    expect(requestedUrl).toBe("http://example.com/thrift");
    expect(requestedHeaders?.["x-custom"]).toBe("custom-val");
    expect(response.status).toBe(200);
    expect(response.headers.get("x-trace-id")).toBe("trace-123");
    expect(response.headers.get("content-type")).toBe("application/x-thrift");

    const text = await response.text();
    expect(text).toBe("thrift-response-payload");
  });

  test("deferThriftCall defers execution until subscription", async () => {
    let calls = 0;
    const obs = deferThriftCall(async () => {
      calls++;
      return `result-${calls}`;
    });
    expect(calls).toBe(0);

    const val1 = await firstValueFrom(obs);
    expect(val1).toBe("result-1");
    expect(calls).toBe(1);

    const val2 = await firstValueFrom(obs);
    expect(val2).toBe("result-2");
    expect(calls).toBe(2);
  });

  test("toObservableClient converts client methods to return Observables", async () => {
    const mockClient = {
      echo: async (msg: string) => `echo:${msg}`,
      value: 42,
    };
    const obsClient = toObservableClient(mockClient);
    expect(obsClient.value).toBe(42);

    const result = await firstValueFrom(obsClient.echo("angular-test"));
    expect(result).toBe("echo:angular-test");
  });

  test("toObservableClient wraps nested .safe methods and returns safe Observable results", async () => {
    const mockClient = {
      echo: async (msg: string) => `echo:${msg}`,
      safe: {
        echo: async (msg: string) => ({ data: `echo:${msg}`, error: undefined }),
      },
    };
    const obsClient = toObservableClient(mockClient);
    const res = await firstValueFrom(obsClient.safe.echo("safe-test"));
    expect(res).toEqual({ data: "echo:safe-test", error: undefined });
  });

  test("toObservableClient unwraps ThriftResult success and emits data", async () => {
    const mockClient = {
      compute: async (x: number) => ({ data: x * 2, error: undefined }),
    };
    const obsClient = toObservableClient(mockClient);
    const result = await firstValueFrom(obsClient.compute(21));
    expect(result).toBe(42);
  });

  test("toObservableClient unwraps ThriftResult error and throws ThriftServiceError", async () => {
    const serviceError = new ThriftServiceError("PaymentFailed", "paymentFailed", {
      code: "INSUFFICIENT_FUNDS",
    });
    const mockClient = {
      pay: async () => ({ data: undefined, error: serviceError }),
    };
    const obsClient = toObservableClient(mockClient);

    await expect(firstValueFrom(obsClient.pay())).rejects.toThrow(
      "Thrift service error [PaymentFailed]",
    );
  });

  test("catchServiceError and catchSystemError seamlessly integrate with RxJS catchError", async () => {
    const serviceError = new ThriftServiceError("PaymentFailed", "paymentFailed", {
      code: "LIMIT_EXCEEDED",
    });
    const mockClient = {
      pay: async () => ({ data: undefined, error: serviceError }),
    };
    const obsClient = toObservableClient(mockClient);

    let caughtDetail: string | undefined;
    const handled$ = obsClient.pay().pipe(
      catchError((err) => {
        const handled = catchServiceError(err, "PaymentFailed", (e) => {
          caughtDetail = (e.data as any).code;
          return of("recovered-from-service-error");
        });
        if (handled !== undefined) return handled;
        return of("unhandled");
      }),
    );

    const val = await firstValueFrom(handled$);
    expect(val).toBe("recovered-from-service-error");
    expect(caughtDetail).toBe("LIMIT_EXCEEDED");

    // Also verify catchSystemError in pipe
    const httpError = new ThriftHttpError(502, "Bad Gateway");
    const mockSysClient = {
      pay: async () => ({ data: undefined, error: httpError }),
    };
    const obsSysClient = toObservableClient(mockSysClient);

    let systemStatus: number | undefined;
    const sysHandled$ = obsSysClient.pay().pipe(
      catchError((err) => {
        const handled = catchSystemError(err, (e) => {
          if (e instanceof ThriftHttpError) systemStatus = e.status;
          return of("system-fallback");
        });
        if (handled !== undefined) return handled;
        return of("unhandled");
      }),
    );

    const sysVal = await firstValueFrom(sysHandled$);
    expect(sysVal).toBe("system-fallback");
    expect(systemStatus).toBe(502);
  });

  test("deferThriftCall unwraps ThriftResult and emits error into error channel", async () => {
    const error = new ThriftServiceError("DeferredError", "err", {});
    const obs = deferThriftCall(async () => ({ data: undefined, error }));
    await expect(firstValueFrom(obs)).rejects.toThrow("Thrift service error [DeferredError]");

    const okObs = deferThriftCall(async () => ({ data: "deferred-ok", error: undefined }));
    const okVal = await firstValueFrom(okObs);
    expect(okVal).toBe("deferred-ok");
  });

  test("toObservableClient cancels underlying call via AbortSignal upon unsubscription", async () => {
    let capturedSignal: AbortSignal | undefined;
    let abortedAtUnsubscribe = false;

    const mockClient = {
      longCall: async (options?: any) => {
        capturedSignal = options?.signal;
        return new Promise<string>((resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            abortedAtUnsubscribe = true;
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      },
    };

    const obsClient = toObservableClient(mockClient);
    const subscription = obsClient.longCall().subscribe({
      error: () => {},
    });

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal?.aborted).toBe(false);

    subscription.unsubscribe();
    expect(abortedAtUnsubscribe).toBe(true);
    expect(capturedSignal?.aborted).toBe(true);
  });

  test("createHttpClientFetch aborts and unsubscribes when init.signal is aborted", async () => {
    let unsubscribed = false;
    const mockHttpClient: AngularHttpClientLike = {
      request: () => {
        return {
          subscribe: () => {
            return {
              unsubscribe: () => {
                unsubscribed = true;
              },
            };
          },
        };
      },
    };

    const controller = new AbortController();
    const adaptedFetch = createHttpClientFetch(mockHttpClient);
    const fetchPromise = adaptedFetch("http://example.com/thrift", {
      signal: controller.signal,
    });

    controller.abort(new DOMException("Manual abort", "AbortError"));
    await expect(fetchPromise).rejects.toThrow("Manual abort");
    expect(unsubscribed).toBe(true);
  });
});
