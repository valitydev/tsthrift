import {
  inject,
  makeEnvironmentProviders,
  type EnvironmentProviders,
  type Provider,
} from "@angular/core";
import {
  mergeHeaderProviders,
  type HttpTransportConfig,
  type ThriftServiceDescriptor,
} from "@vality/tsthrift";
import { THRIFT_CONFIG, THRIFT_SERVICES_REGISTRY, getServiceToken } from "./tokens.ts";
import { toObservableClient } from "./rxjs.ts";
import {
  getObservableServiceConfig,
  getObservableServiceDescriptor,
  isObservableServiceToken,
  type ObservableServiceToken,
} from "./observable-service.ts";

/**
 * Target accepted by provideThriftService: either a raw ThriftServiceDescriptor or an ObservableServiceToken.
 */
export type ThriftServiceTarget<TService extends object = object> =
  | ThriftServiceDescriptor<TService>
  | ObservableServiceToken<TService>;

/**
 * Provides global Thrift client configuration in Angular DI.
 */
export function provideThriftConfig(config: HttpTransportConfig): Provider {
  return {
    provide: THRIFT_CONFIG,
    useValue: config,
  };
}

/**
 * Provides an individual Thrift service proxy in Angular DI by its descriptor or ObservableServiceToken.
 */
export function provideThriftService<TService extends object>(
  target: ThriftServiceTarget<TService>,
  config?: Partial<HttpTransportConfig>,
): Provider {
  const isToken = isObservableServiceToken(target);
  const descriptor = isToken ? getObservableServiceDescriptor(target)! : target;
  const token = isToken ? target : getServiceToken(descriptor);
  const targetConfig = isToken ? getObservableServiceConfig(target) : undefined;

  return {
    provide: token,
    useFactory: () => {
      const baseConfig = inject(THRIFT_CONFIG, { optional: true });
      const factory = descriptor.createService;
      const effectiveOverride = !targetConfig
        ? config
        : !config
          ? targetConfig
          : {
              ...targetConfig,
              ...config,
              headers: mergeHeaderProviders(targetConfig.headers, config.headers),
            };
      const rawClient = !effectiveOverride
        ? factory(baseConfig)
        : !baseConfig
          ? factory(effectiveOverride)
          : factory({
              ...baseConfig,
              ...effectiveOverride,
              headers: mergeHeaderProviders(baseConfig.headers, effectiveOverride.headers),
            });
      return toObservableClient(rawClient);
    },
  };
}

/**
 * Registers multiple Thrift services in Angular DI.
 */
export function provideThriftServices(
  ...serviceLists: (ThriftServiceTarget | readonly ThriftServiceTarget[])[]
): EnvironmentProviders {
  const flatServices: ThriftServiceDescriptor[] = [];
  for (const item of serviceLists) {
    if (Array.isArray(item)) {
      for (const s of item) {
        flatServices.push(
          isObservableServiceToken(s)
            ? getObservableServiceDescriptor(s)!
            : (s as ThriftServiceDescriptor),
        );
      }
    } else if (item && typeof item === "object") {
      flatServices.push(
        isObservableServiceToken(item)
          ? getObservableServiceDescriptor(item)!
          : (item as ThriftServiceDescriptor),
      );
    }
  }

  const providers: Provider[] = [
    {
      provide: THRIFT_SERVICES_REGISTRY,
      useFactory: () => {
        const registry = new Map<string, ThriftServiceDescriptor>();
        for (const service of flatServices) {
          registry.set(`${service.namespace}.${service.serviceName}`, service);
          registry.set(service.serviceName, service);
        }
        return registry;
      },
    },
  ];

  for (const service of flatServices) {
    const token = getServiceToken(service);
    providers.push({
      provide: token,
      useFactory: () => {
        const baseConfig = inject(THRIFT_CONFIG, { optional: true });
        const factory = service.createService;
        return toObservableClient(factory(baseConfig) as object);
      },
    });
  }

  return makeEnvironmentProviders(providers);
}
