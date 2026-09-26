import { describe, expect, test } from "vite-plus/test";
import { createEnvironmentInjector, inject, Injector, runInInjectionContext } from "@angular/core";
import { of } from "rxjs";
import {
  THRIFT_CONFIG,
  THRIFT_SERVICES_REGISTRY,
  createHttpClientFetch,
  provideThriftConfig,
  provideThriftServices,
  type AngularHttpClientLike,
} from "../src/angular/index.ts";
import type { ThriftServiceDescriptor } from "../src/index.ts";

describe("Angular Thrift DI integration", () => {
  abstract class TestServiceClient {
    abstract echo(msg: string): string;
  }

  const dummyDescriptor: ThriftServiceDescriptor<TestServiceClient> = {
    serviceName: "TestService",
    namespace: "test",
    token: TestServiceClient,
    createClient: (config?: any) => ({
      echo: (msg: string) => `[${config?.endpoint ?? "default"}] ${msg}`,
    }),
    getMetadata: async () => [],
  };

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

  test("provideThriftServices registers service registry and client instances", () => {
    const envInjector = createEnvironmentInjector(
      [
        provideThriftConfig({ endpoint: "http://example.com/configured" }),
        provideThriftServices([dummyDescriptor]),
      ],
      null as unknown as any,
    );

    runInInjectionContext(envInjector, () => {
      const config = envInjector.get(THRIFT_CONFIG);
      expect(config).toEqual({ endpoint: "http://example.com/configured" });

      const registry = envInjector.get(THRIFT_SERVICES_REGISTRY);
      expect(registry.has("TestService")).toBe(true);

      // 1. Native Angular inject(TestServiceClient) using abstract class token
      const clientByClass = inject(TestServiceClient);
      expect(clientByClass.echo("native-class")).toBe(
        "[http://example.com/configured] native-class",
      );

      // 2. Native Angular inject(dummyDescriptor.token)
      const clientByToken = inject<TestServiceClient>(dummyDescriptor.token);
      expect(clientByToken.echo("native-token")).toBe(
        "[http://example.com/configured] native-token",
      );
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
});
