import { THRIFT_METHOD_ARGUMENT_COUNT, THRIFT_METHOD_RESULT } from "./method-arguments.ts";
import type { Metadata } from "../metadata/types.ts";
import type { ThriftError } from "./errors.ts";

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
  | ((namespace: string) => Promise<MetadataModule> | MetadataModule);

/** Declarative client connection and transport configuration. */
export interface HttpTransportConfig {
  /** Target service endpoint URL or dynamic factory. */
  endpoint: string | (() => string | Promise<string>);
  /** Static headers or dynamic provider invoked before each request. */
  headers?: HeaderProvider;
  /** Request timeout in milliseconds (defaults to 60_000). */
  timeoutMs?: number;
  /** Custom fetch implementation or framework adapter (e.g. Angular HttpClient). */
  fetch?: typeof fetch;
  /** Include argument and response payloads in logs. Headers are never included. */
  logPayloads?: boolean;
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
  sequenceId?: number;
  durationMs?: number;
  traceId?: string;
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

/** Unique symbol used for phantom service error map property. */
export const THRIFT_ERRORS: unique symbol = Symbol.for("@vality/tsthrift/errors");

/** Unique symbol used to access typed non-throwing Result client on service instance. */
export const THRIFT_RESULT: unique symbol = Symbol.for("@vality/tsthrift/result");

/**
 * Maps a service client's methods to methods returning Promise<ThriftResult<Data, MethodError>>.
 * Preserves parameter types and automatically infers precise method errors from THRIFT_ERRORS.
 */
export type ThriftResultClient<TClient extends object> = {
  readonly [THRIFT_METHOD_RESULT]: true;
  readonly [THRIFT_ERRORS]?: TClient extends { readonly [THRIFT_ERRORS]?: infer Errors }
    ? Errors
    : Record<string, ThriftError>;
} & {
  [K in keyof TClient as K extends symbol ? never : K]: TClient[K] extends (
    ...args: infer Args
  ) => Promise<infer R>
    ? (
        ...args: Args
      ) => Promise<
        ThriftResult<
          R,
          TClient extends { readonly [THRIFT_ERRORS]?: infer TErrors }
            ? K extends keyof TErrors
              ? TErrors[K]
              : ThriftError
            : ThriftError
        >
      >
    : TClient[K];
};

async function toThriftResultPromise<TData, TError = ThriftError>(
  promise: Promise<TData>,
): Promise<ThriftResult<TData, TError>> {
  try {
    const data = await promise;
    return { data, error: undefined };
  } catch (error) {
    return { data: undefined, error: error as TError };
  }
}

function memberNames(target: object): string[] {
  const names = new Set<string>();
  for (let object: object | null = target; object && object !== Object.prototype;) {
    for (const name of Object.getOwnPropertyNames(object)) {
      if (name !== "constructor" && name !== "then") names.add(name);
    }
    object = Object.getPrototypeOf(object);
  }
  return [...names];
}

/**
 * Wraps a Promise into a ThriftResult object { data, error }.
 * Captures thrown ThriftServiceError exceptions or system errors.
 */
export function toThriftResult<TData, TError = ThriftError>(
  promise: Promise<TData>,
): Promise<ThriftResult<TData, TError>>;

/**
 * Returns a typed Result-client proxy where every method returns Promise<ThriftResult<Data, Error>>.
 */
export function toThriftResult<TClient extends object>(
  client: TClient,
): ThriftResultClient<TClient>;

export function toThriftResult(target: any): any {
  if (target && typeof target === "object" && typeof target.then === "function") {
    return toThriftResultPromise(target);
  }
  const wrapped: Record<string | symbol, unknown> = {};
  for (const name of memberNames(target)) {
    const original = target[name];
    if (typeof original !== "function") {
      Object.defineProperty(wrapped, name, { get: () => target[name], enumerable: true });
      continue;
    }
    const call = (...args: unknown[]) => toThriftResultPromise(original.apply(target, args));
    if (THRIFT_METHOD_ARGUMENT_COUNT in original) {
      Object.defineProperty(call, THRIFT_METHOD_ARGUMENT_COUNT, {
        get: () => original[THRIFT_METHOD_ARGUMENT_COUNT],
      });
    }
    Object.defineProperty(call, THRIFT_METHOD_RESULT, { value: true });
    wrapped[name] = call;
  }
  Object.defineProperty(wrapped, THRIFT_METHOD_RESULT, { value: true });
  return wrapped;
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
  createService: (config: HttpTransportConfig) => TService;
  /** Lazy loader returning parsed schema metadata. */
  getMetadata: () => Promise<Metadata[]>;
  /** Phantom type property carrying method error map for inference. */
  readonly __errors__?: TErrors;
}

/** Extracts the method error type from a Service interface, client instance, descriptor, or error map. */
export type ThriftMethodError<TTarget, TMethod extends string = string> = TTarget extends {
  readonly [THRIFT_ERRORS]?: infer TErrors;
}
  ? TMethod extends keyof TErrors
    ? TErrors[TMethod]
    : ThriftError
  : TTarget extends ThriftServiceDescriptor<any, infer TErrors>
    ? TMethod extends keyof TErrors
      ? TErrors[TMethod]
      : ThriftError
    : TMethod extends keyof TTarget
      ? TTarget[TMethod]
      : ThriftError;
