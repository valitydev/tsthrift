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
export function provideThriftService<TService>(
  descriptor: ThriftServiceDescriptor<TService>,
  config?: Partial<HttpTransportConfig>,
): Provider {
  return {
    provide: getServiceToken(descriptor),
    useFactory: () => {
      const baseConfig = inject(THRIFT_CONFIG, { optional: true });
      const factory = descriptor.createService;
      if (!config) {
        return factory(baseConfig);
      }
      if (!baseConfig) {
        return factory(config);
      }
      return factory({
        ...baseConfig,
        ...config,
        headers: mergeHeaderProviders(baseConfig.headers, config.headers),
      });
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
        return factory(baseConfig);
      },
    });
  }

  return makeEnvironmentProviders(providers);
}
