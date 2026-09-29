import { InjectionToken, inject } from "@angular/core";
import type { HttpTransportConfig, ThriftServiceDescriptor } from "@vality/tsthrift";
import type { ObservableClient } from "./rxjs.ts";
import { wrapObservableClient } from "./observable-client.ts";
import { mergeServiceConfig } from "./service-config.ts";
import { THRIFT_CONFIG, registerServiceToken } from "./tokens.ts";

/** An injectable service whose methods return cold Observables. */
export type ObservableServiceToken<TClient extends object = object> = InjectionToken<
  ObservableClient<TClient>
>;

/** An injectable service whose methods return Promises. */
export type PromiseServiceToken<TClient extends object = object> = InjectionToken<TClient>;

interface ServiceDefinition {
  descriptor: ThriftServiceDescriptor<object>;
  config?: Partial<HttpTransportConfig>;
  mode: "promise" | "observable";
}

const definitions = new WeakMap<object, ServiceDefinition>();

export function getServiceDefinition(target: unknown): ServiceDefinition | undefined {
  return target !== null && typeof target === "object" ? definitions.get(target) : undefined;
}

/** Checks whether a token was created as an Observable service. */
export function isObservableServiceToken<TClient extends object = object>(
  target: unknown,
): target is ObservableServiceToken<TClient> {
  return getServiceDefinition(target)?.mode === "observable";
}

function createToken<TClient extends object, TService extends object>(
  descriptor: ThriftServiceDescriptor<TClient>,
  config: Partial<HttpTransportConfig> | undefined,
  mode: ServiceDefinition["mode"],
  createClient: (client: TClient) => TService,
): InjectionToken<TService> {
  const token = new InjectionToken<TService>(
    `${descriptor.namespace}.${descriptor.serviceName}.${mode}`,
    {
      providedIn: "root",
      factory: () => {
        const baseConfig = inject(THRIFT_CONFIG, { optional: true });
        return createClient(descriptor.createService(mergeServiceConfig(baseConfig, config)));
      },
    },
  );
  definitions.set(token, { descriptor, config, mode });
  Object.defineProperties(token, {
    descriptor: { value: descriptor },
    config: { value: config },
  });
  return token;
}

/** Creates a root-provided Observable service token with optional transport configuration. */
export function createObservableService<TClient extends object>(
  descriptor: ThriftServiceDescriptor<TClient>,
  config?: Partial<HttpTransportConfig>,
): ObservableServiceToken<TClient> {
  const token = createToken(descriptor, config, "observable", wrapObservableClient<TClient>);
  registerServiceToken(descriptor, token);
  return token;
}

/** Creates a root-provided Promise service token with optional transport configuration. */
export function createPromiseService<TClient extends object>(
  descriptor: ThriftServiceDescriptor<TClient>,
  config?: Partial<HttpTransportConfig>,
): PromiseServiceToken<TClient> {
  return createToken(descriptor, config, "promise", (client) => client);
}
