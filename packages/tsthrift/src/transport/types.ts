import type { Metadata } from "../metadata/types.ts";

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
  | (() => Promise<MetadataModule> | MetadataModule);

/** Declarative client connection and transport configuration. */
export interface HttpTransportConfig {
  /** Target service endpoint URL. */
  endpoint: string;
  /** Static headers or dynamic provider invoked before each request. */
  headers?: HeaderProvider;
  /** Request timeout in milliseconds (defaults to 60_000). */
  timeoutMs?: number;
  /** Custom fetch implementation or framework adapter (e.g. Angular HttpClient). */
  fetch?: typeof fetch;
  /** Optional logging callback invoked on RPC call lifecycle (call, success, error). */
  loggingFn?: (params: ThriftLogParams) => void;
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
}

/** Low-level transport function sending raw bytes and receiving response bytes. */
export type TransportFunction = (
  payload: Uint8Array,
  options?: RequestOptions,
) => Promise<Uint8Array>;

/** Descriptor of a generated Thrift service containing metadata and client factory. */
export interface ThriftServiceDescriptor<TClient = unknown> {
  /** Service name in IDL (e.g. "Repository" or "UserService"). */
  serviceName: string;
  /** IDL namespace or module name. */
  namespace: string;
  /** Factory creating typed Thrift client instance. */
  createClient: (config?: any) => TClient;
  /** Lazy loader returning parsed schema metadata. */
  getMetadata: () => Promise<Metadata[]>;
}
