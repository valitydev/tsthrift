import { mergeServiceConfig } from "./service-config.ts";
import {
  type EnvironmentProviders,
  type Provider,
  inject,
  makeEnvironmentProviders,
} from "@angular/core";
import { type HttpTransportConfig, type ThriftServiceDescriptor } from "@vality/tsthrift";
import { THRIFT_CONFIG, THRIFT_SERVICES_REGISTRY, getServiceToken } from "./tokens.ts";
import { wrapObservableClient } from "./observable-client.ts";
import {
  type ObservableServiceToken,
  type PromiseServiceToken,
  getServiceDefinition,
} from "./service.ts";

/**
 * Target accepted by provideThriftService: a descriptor, a Promise service token, or an Observable service token.
 */
export type ThriftServiceTarget<TService extends object = object> =
  | ThriftServiceDescriptor<TService>
  | ObservableServiceToken<TService>
  | PromiseServiceToken<TService>;

/**
 * Provides global Thrift client configuration in Angular DI.
 * Accepts either a static configuration object or a factory function (which can use inject()).
 */
export function provideThriftConfig(
  configOrFactory: HttpTransportConfig | (() => HttpTransportConfig),
): Provider {
  if (typeof configOrFactory === "function") {
    return {
      provide: THRIFT_CONFIG,
      useFactory: configOrFactory,
    };
  }
  return {
    provide: THRIFT_CONFIG,
    useValue: configOrFactory,
  };
}

/**
 * Provides an individual Thrift service proxy in Angular DI by its descriptor or service token.
 */
export function provideThriftService<TService extends object>(
  target: ThriftServiceTarget<TService>,
  config?: Partial<HttpTransportConfig>,
): Provider {
  const definition = getServiceDefinition(target);
  const descriptor = definition?.descriptor ?? (target as ThriftServiceDescriptor<TService>);
  const token = definition ? target : getServiceToken(descriptor);
  const targetConfig = definition?.config;

  return {
    provide: token,
    useFactory: () => {
      const baseConfig = inject(THRIFT_CONFIG, { optional: true });
      const factory = descriptor.createService;
      const rawClient = factory(mergeServiceConfig(baseConfig, targetConfig, config));
      return definition?.mode === "promise" ? rawClient : wrapObservableClient(rawClient);
    },
  };
}

/**
 * Registers multiple Thrift services in Angular DI.
 */
export function provideThriftServices(
  ...serviceLists: (ThriftServiceTarget | readonly ThriftServiceTarget[])[]
): EnvironmentProviders {
  const targets = serviceLists.flat() as ThriftServiceTarget[];
  const flatServices = targets.map(
    (target) => getServiceDefinition(target)?.descriptor ?? (target as ThriftServiceDescriptor),
  );

  const providers: Provider[] = [
    {
      provide: THRIFT_SERVICES_REGISTRY,
      useFactory: () => {
        const registry = new Map<string, ThriftServiceDescriptor>();
        for (const service of flatServices) {
          registry.set(`${service.namespace}.${service.serviceName}`, service);
        }
        return registry;
      },
    },
  ];

  providers.push(...targets.map((target) => provideThriftService(target)));

  return makeEnvironmentProviders(providers);
}
