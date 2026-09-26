import {
  inject,
  makeEnvironmentProviders,
  type EnvironmentProviders,
  type Provider,
} from "@angular/core";
import type { ThriftClientConfig, ThriftServiceDescriptor } from "../index.ts";
import { THRIFT_CONFIG, THRIFT_SERVICES_REGISTRY } from "./tokens.ts";

/**
 * Provides global Thrift client configuration in Angular DI.
 */
export function provideThriftConfig(config: ThriftClientConfig): Provider {
  return {
    provide: THRIFT_CONFIG,
    useValue: config,
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
          registry.set(service.serviceName, service);
        }
        return registry;
      },
    },
  ];

  for (const service of flatServices) {
    if (service.token) {
      providers.push({
        provide: service.token,
        useFactory: () => {
          const baseConfig = inject(THRIFT_CONFIG, { optional: true });
          return service.createClient(baseConfig);
        },
      });
    }
  }

  return makeEnvironmentProviders(providers);
}
