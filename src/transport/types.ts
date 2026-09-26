/** Provider of request headers, either static record or sync/async factory. */
export type HeaderProvider =
  | Record<string, string>
  | (() => Record<string, string> | Promise<Record<string, string>>);

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
