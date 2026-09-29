import { InjectionToken } from "@angular/core";
import type { HttpTransportConfig, ThriftServiceDescriptor } from "@vality/tsthrift";
import type { ObservableClient } from "./rxjs.ts";

/** Injection token for global Thrift client configuration. */
export const THRIFT_CONFIG: InjectionToken<HttpTransportConfig> =
  new InjectionToken<HttpTransportConfig>("THRIFT_CONFIG");

/** Injection token for the registry map of all provided Thrift services. */
export const THRIFT_SERVICES_REGISTRY: InjectionToken<Map<string, ThriftServiceDescriptor>> =
  new InjectionToken<Map<string, ThriftServiceDescriptor>>("THRIFT_SERVICES_REGISTRY");

const serviceTokens = new WeakMap<ThriftServiceDescriptor<any>, InjectionToken<any>>();

/**
 * Returns a stable InjectionToken for a given Thrift service descriptor,
 * typed as an ObservableClient in Angular DI.
 * Tokens are cached per descriptor instance.
 */
export function getServiceToken<TClient = unknown>(
  descriptor: ThriftServiceDescriptor<TClient>,
): InjectionToken<TClient extends object ? ObservableClient<TClient> : TClient> {
  let token = serviceTokens.get(descriptor);
  if (!token) {
    token = new InjectionToken<any>(`${descriptor.namespace}.${descriptor.serviceName}`);
    serviceTokens.set(descriptor, token);
  }
  return token as InjectionToken<TClient extends object ? ObservableClient<TClient> : TClient>;
}

/**
 * Registers an existing InjectionToken for a given Thrift service descriptor in the cache.
 */
export function registerServiceToken<TClient = unknown>(
  descriptor: ThriftServiceDescriptor<TClient>,
  token: InjectionToken<TClient extends object ? ObservableClient<TClient> : TClient>,
): void {
  serviceTokens.set(descriptor, token);
}
