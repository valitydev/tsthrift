import { InjectionToken, inject } from "@angular/core";
import {
  type HttpTransportConfig,
  type ThriftServiceDescriptor,
  mergeHeaderProviders,
} from "@vality/tsthrift";
import { THRIFT_CONFIG, registerServiceToken } from "./tokens.ts";
import { type ObservableClient, toObservableClient } from "./rxjs.ts";

const tokenDescriptors = new WeakMap<InjectionToken<any>, ThriftServiceDescriptor<any>>();
const tokenConfigs = new WeakMap<InjectionToken<any>, Partial<HttpTransportConfig> | undefined>();

/**
 * An Angular InjectionToken for an observable Thrift client.
 */
export type ObservableServiceToken<TClient extends object = object> = InjectionToken<
  ObservableClient<TClient>
>;

/**
 * Type guard checking if a target is an ObservableServiceToken created by createObservableService.
 */
export function isObservableServiceToken<TClient extends object = object>(
  target: unknown,
): target is ObservableServiceToken<TClient> {
  return (
    target instanceof InjectionToken && (tokenDescriptors.has(target) || "descriptor" in target)
  );
}

/**
 * Retrieves the ThriftServiceDescriptor associated with an ObservableServiceToken, if any.
 */
export function getObservableServiceDescriptor<TClient extends object = object>(
  token: ObservableServiceToken<TClient>,
): ThriftServiceDescriptor<TClient> | undefined {
  return tokenDescriptors.get(token) ?? (token as any).descriptor;
}

/**
 * Retrieves the per-service config associated with an ObservableServiceToken, if any.
 */
export function getObservableServiceConfig(
  token: ObservableServiceToken<any>,
): Partial<HttpTransportConfig> | undefined {
  return tokenConfigs.get(token) ?? (token as any).config;
}

/**
 * Creates an Angular InjectionToken for an observable Thrift client.
 * Self-provides in "any" injector by default, resolving THRIFT_CONFIG and merging per-service options.
 *
 * @param descriptor The Thrift service descriptor.
 * @param config Optional per-service transport configuration (endpoint, headers, timeout, woody, fetch).
 */
export function createObservableService<TClient extends object>(
  descriptor: ThriftServiceDescriptor<TClient>,
  config?: Partial<HttpTransportConfig>,
): ObservableServiceToken<TClient> {
  const token = new InjectionToken<ObservableClient<TClient>>(
    `${descriptor.namespace}.${descriptor.serviceName}`,
    {
      providedIn: "any",
      factory: () => {
        const baseConfig = inject(THRIFT_CONFIG, { optional: true });
        const factory = descriptor.createService;
        const effectiveConfig = !config
          ? baseConfig
          : !baseConfig
            ? config
            : {
                ...baseConfig,
                ...config,
                headers: mergeHeaderProviders(baseConfig.headers, config.headers),
              };
        const rawClient = factory(effectiveConfig);
        return toObservableClient(rawClient as object) as ObservableClient<TClient>;
      },
    },
  );

  tokenDescriptors.set(token, descriptor);
  tokenConfigs.set(token, config);

  Object.defineProperties(token, {
    descriptor: { value: descriptor, writable: false },
    config: { value: config, writable: false },
  });

  registerServiceToken(descriptor, token);

  return token;
}
