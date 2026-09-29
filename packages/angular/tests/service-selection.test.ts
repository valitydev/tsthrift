import {
  type EnvironmentInjector,
  Injector,
  createEnvironmentInjector,
  ɵINJECTOR_SCOPE,
} from "@angular/core";
import { firstValueFrom } from "rxjs";
import { expect, expectTypeOf, test, vi } from "vite-plus/test";
import {
  type RequestOptions,
  THRIFT_ERRORS,
  THRIFT_METHOD_ARGUMENT_COUNT,
  type ThriftServiceDescriptor,
  type ThriftServiceError,
} from "@vality/tsthrift";
import * as api from "../src/index.ts";

type Failure = ThriftServiceError<"example.Missing", { id: string }>;
interface Client {
  readonly [THRIFT_ERRORS]?: { echo: Failure };
  echo(value: string, options?: RequestOptions): Promise<string>;
}

function fixture() {
  const called = vi.fn();
  const descriptor: ThriftServiceDescriptor<Client> = {
    namespace: "example",
    serviceName: "Example",
    getMetadata: async () => [],
    createService: (config) => ({
      echo: Object.assign(
        async (value: string) => {
          called(value);
          const endpoint =
            typeof config.endpoint === "function" ? await config.endpoint() : config.endpoint;
          return `${endpoint}:${value}`;
        },
        { [THRIFT_METHOD_ARGUMENT_COUNT]: 1 },
      ),
    }),
  };
  return { descriptor, called };
}

test("Promise and Observable services coexist in root DI with distinct types and lifetimes", async () => {
  const { descriptor, called } = fixture();
  const observableToken = api.createObservableService(descriptor, { endpoint: "observable" });
  const promiseToken = api.createPromiseService(descriptor, { endpoint: "promise" });
  expect(api.getServiceToken(descriptor)).toBe(observableToken);
  expect(api.isObservableServiceToken(promiseToken)).toBe(false);
  const injector = Injector.create({
    providers: [{ provide: ɵINJECTOR_SCOPE, useValue: "root" }],
  });
  try {
    const promiseClient = injector.get(promiseToken);
    const observableClient = injector.get(observableToken);
    expectTypeOf(promiseClient).toEqualTypeOf<Client>();
    const stream = observableClient.echo("cold");
    expectTypeOf(stream).toEqualTypeOf<api.ThriftObservable<string, Failure>>();
    expectTypeOf(observableClient.echo).parameters.toEqualTypeOf<
      [value: string, options?: RequestOptions]
    >();
    expect(called).not.toHaveBeenCalled();
    await expect(promiseClient.echo("now")).resolves.toBe("promise:now");
    await expect(firstValueFrom(stream)).resolves.toBe("observable:cold");
    expect(observableClient).not.toHaveProperty("promise");
  } finally {
    injector.destroy();
  }
});

test("bulk providers accept both service modes", async () => {
  const { descriptor } = fixture();
  const promiseToken = api.createPromiseService(descriptor);
  const observableToken = api.createObservableService(descriptor);
  const injector = createEnvironmentInjector(
    [
      api.provideThriftConfig({ endpoint: "bulk" }),
      api.provideThriftServices([promiseToken, observableToken]),
    ],
    null as unknown as EnvironmentInjector,
  );
  try {
    await expect(injector.get(promiseToken).echo("value")).resolves.toBe("bulk:value");
    await expect(firstValueFrom(injector.get(observableToken).echo("value"))).resolves.toBe(
      "bulk:value",
    );
    expect(injector.get(api.THRIFT_SERVICES_REGISTRY).size).toBe(1);
  } finally {
    injector.destroy();
  }
});

test("providers preserve each service mode and scoped configuration", async () => {
  const { descriptor } = fixture();
  const promiseToken = api.createPromiseService(descriptor, { endpoint: "initial" });
  const observableToken = api.createObservableService(descriptor, { endpoint: "observable" });
  const injector = Injector.create({
    providers: [
      api.provideThriftConfig({ endpoint: "global" }),
      api.provideThriftService(promiseToken, { endpoint: "override" }),
      api.provideThriftService(observableToken),
    ],
  });
  try {
    await expect(injector.get(promiseToken).echo("value")).resolves.toBe("override:value");
    await expect(firstValueFrom(injector.get(observableToken).echo("value"))).resolves.toBe(
      "observable:value",
    );
  } finally {
    injector.destroy();
  }
});
