import { InjectionToken } from "@angular/core";
import type { HttpTransportConfig, ThriftServiceDescriptor } from "../index.ts";

/** Injection token for global Thrift client configuration. */
export const THRIFT_CONFIG = new InjectionToken<HttpTransportConfig>("THRIFT_CONFIG");

/** Injection token for the registry map of all provided Thrift services. */
export const THRIFT_SERVICES_REGISTRY = new InjectionToken<Map<string, ThriftServiceDescriptor>>(
  "THRIFT_SERVICES_REGISTRY",
);
