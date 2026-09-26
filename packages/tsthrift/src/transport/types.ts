import type { ThriftConverter } from "../converter/converter.ts";
import type { MetadataIndex } from "../converter/metadata-index.ts";
import type { ClassRegistry, I64Mode, Metadata } from "../converter/types.ts";

/** Provider of request headers, either static record or sync/async factory. */
export type HeaderProvider =
  | Record<string, string>
  | (() => Record<string, string> | Promise<Record<string, string>>);

/** Metadata module or array type supporting ESM default export. */
export type MetadataModule = Metadata[] | { default: Metadata[] };

/** Metadata source supporting static array, Promise, or dynamic import factory. */
export type MetadataSource =
  | Metadata[]
  | Promise<MetadataModule>
  | (() => Promise<MetadataModule> | MetadataModule);

/** Declarative client connection and transport configuration. */
export interface ThriftClientConfig {
  /** Target service endpoint URL. */
  endpoint: string;
  /** Static headers or dynamic provider invoked before each request. */
  headers?: HeaderProvider;
  /** Request timeout in milliseconds (defaults to 60_000). */
  timeoutMs?: number;
  /** Custom fetch implementation or framework adapter (e.g. Angular HttpClient). */
  fetch?: typeof fetch;
  /** Optional metadata schemas for automatic plain-object <-> Thrift instance conversion. */
  metadata?: MetadataSource;
  /** Service namespace (optional if serviceName is unique or auto-inferred). */
  namespace?: string;
  /** Service name in IDL (e.g. "Example" or "UserService"). */
  serviceName?: string;
  /** 64-bit integer conversion strategy (defaults to "bigint"). */
  i64Mode?: I64Mode;
  /** Registry of Thrift constructor classes. */
  classRegistry?: ClassRegistry;
  /** Pre-configured converter instance. */
  converter?: ThriftConverter;
  /** Pre-built metadata index. */
  index?: MetadataIndex;
}

/** Per-call request options passed by the caller. */
export interface RequestOptions {
  /** Request cancellation signal. */
  signal?: AbortSignal;
  /** Additional headers for this specific call. */
  headers?: Record<string, string>;
  /** Timeout override in milliseconds for this specific call. */
  timeoutMs?: number;
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
  /** Optional dependency injection token or class. */
  token?: any;
  /** Factory creating typed Thrift client instance. */
  createClient: (config: any) => TClient;
  /** Lazy loader returning parsed schema metadata. */
  getMetadata: () => Promise<Metadata[]>;
}
