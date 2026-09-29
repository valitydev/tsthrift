import type { Metadata } from "../metadata/types.ts";
import { type ThriftError, ThriftServiceError, getThriftExceptionInfo } from "./errors.ts";

/** Result type for safe RPC calls in openapi-fetch style. */
export type ThriftResult<TData, TError = ThriftError> =
  | { data: TData; error: undefined }
  | { data: undefined; error: TError };

/** Unwraps a ThriftResult, returning data if successful, or throwing error if failed. */
export function unwrapResult<TData, TError>(result: ThriftResult<TData, TError>): TData {
  if (result.error !== undefined) {
    throw result.error;
  }
  return (result as { data: TData }).data;
}

/** Provider of request headers, either static record or sync/async factory receiving higher-level base headers. */
export type HeaderProvider =
  | Record<string, string>
  | ((
      baseHeaders: Record<string, string>,
    ) => Record<string, string> | Promise<Record<string, string>>)
  | (() => Record<string, string> | Promise<Record<string, string>>);

/** Metadata module or array type supporting ESM default export. */
export type MetadataModule = Metadata[] | { default: Metadata[] };

/** Metadata source supporting static array, Promise, or dynamic import factory. */
export type MetadataSource =
  | Metadata[]
  | Promise<MetadataModule>
  | ((namespace?: string) => Promise<MetadataModule> | MetadataModule);

import type { WoodyHeadersConfig } from "./woody.ts";

/** Declarative client connection and transport configuration. */
export interface HttpTransportConfig {
  /** Target service endpoint URL or dynamic factory. */
  endpoint: string | (() => string | Promise<string>);
  /** Static headers or dynamic provider invoked before each request. */
  headers?: HeaderProvider;
  /** Request timeout in milliseconds (defaults to 60_000). */
  timeoutMs?: number;
  /** Enable automatic Woody tracing headers generation per request. */
  woody?: boolean | WoodyHeadersConfig;
  /** Custom fetch implementation or framework adapter (e.g. Angular HttpClient). */
  fetch?: typeof fetch;
  /** Optional logging callback invoked on RPC call lifecycle (call, success, error). */
  loggingFn?: (params: ThriftLogParams) => void;
  /** Automatically add service routing header (e.g. 'service: <ServiceName>' if true or custom header name). */
  serviceHeader?: boolean | string;
  /** Target service name for serviceHeader routing. */
  serviceName?: string;
}

/** Parameters passed to the logging callback on RPC call lifecycle events. */
export interface ThriftLogParams {
  type: "call" | "success" | "error";
  name: string;
  serviceName: string;
  namespace?: string;
  args?: unknown[];
  headers?: Record<string, string>;
  response?: unknown;
  error?: unknown;
}

/** Per-call request options passed by the caller. */
export interface RequestOptions {
  /** Request cancellation signal. */
  signal?: AbortSignal;
  /** Timeout override in milliseconds for this specific call. */
  timeoutMs?: number;
  /** Optional headers for this specific call. */
  headers?: Record<string, string>;
  /** Optional service name override for this call. */
  serviceName?: string;
  /** Automatically add service routing header for this call. */
  serviceHeader?: boolean | string;
}

/** Alias for RequestOptions with Thrift namespace prefix to avoid identifier collisions. */
export type ThriftRequestOptions = RequestOptions;

/**
 * Wraps a Promise into a ThriftResult object { data, error }.
 * Captures thrown ThriftServiceError exceptions or system errors.
 */
export async function toThriftResult<TData, TError = unknown>(
  promise: Promise<TData>,
): Promise<ThriftResult<TData, TError>> {
  try {
    const data = await promise;
    return { data, error: undefined };
  } catch (error) {
    const info = getThriftExceptionInfo(error);
    if (info && error && typeof error === "object") {
      return {
        data: undefined,
        error: new ThriftServiceError(info.type, info.fieldName, error) as unknown as TError,
      };
    }
    return { data: undefined, error: error as TError };
  }
}

/** Low-level transport function sending raw bytes and receiving response bytes. */
export type TransportFunction = (
  payload: Uint8Array,
  options?: RequestOptions,
) => Promise<Uint8Array>;

/** Descriptor of a generated Thrift service containing metadata and service factory. */
export interface ThriftServiceDescriptor<TService = unknown, TErrors = any> {
  /** Service name in IDL (e.g. "Repository" or "UserService"). */
  serviceName: string;
  /** IDL namespace or module name. */
  namespace: string;
  /** Factory creating typed Thrift service proxy instance. */
  createService: (config?: any) => TService;
  /** Lazy loader returning parsed schema metadata. */
  getMetadata: () => Promise<Metadata[]>;
  /** Phantom type property carrying method error map for inference. */
  readonly __errors__?: TErrors;
}

/** Extracts the method error type from a ThriftServiceDescriptor or error map interface. */
export type ThriftMethodError<TTarget, TMethod extends string = string> =
  TTarget extends ThriftServiceDescriptor<any, infer TErrors>
    ? TMethod extends keyof TErrors
      ? TErrors[TMethod]
      : unknown
    : TMethod extends keyof TTarget
      ? TTarget[TMethod]
      : unknown;
