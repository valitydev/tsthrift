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
 * Provides an individual Thrift service proxy in Angular DI by its descriptor.
 */
export function provideThriftService<TService extends object>(
  descriptor: ThriftServiceDescriptor<TService>,
  config?: Partial<HttpTransportConfig>,
): Provider {
  return {
    provide: getServiceToken(descriptor),
    useFactory: () => {
      const baseConfig = inject(THRIFT_CONFIG, { optional: true });
      const factory = descriptor.createService;
      const rawClient = !config
        ? factory(baseConfig)
        : !baseConfig
          ? factory(config)
          : factory({
              ...baseConfig,
              ...config,
              headers: mergeHeaderProviders(baseConfig.headers, config.headers),
            });
      return toObservableClient(rawClient);
    },
  };
}

/**
 * Registers multiple Thrift services in Angular DI.
 */
export function provideThriftServices(
  ...serviceLists: (ThriftServiceDescriptor | readonly ThriftServiceDescriptor[])[]
): EnvironmentProviders {
  const flatServices: ThriftServiceDescriptor[] = [];
  for (const item of serviceLists) {
    if (Array.isArray(item)) {
      flatServices.push(...item);
    } else if (item && typeof item === "object") {
      flatServices.push(item as ThriftServiceDescriptor);
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
