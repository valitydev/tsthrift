# @vality/tsthrift

## 0.1.0

### Minor Changes

- bcaa7c3: ### Features
  
  - **`@vality/tsthrift`**:
    - Web Standards First Thrift runtime and client for modern browsers, Web Workers, and Node.js (zero Node-specific runtime dependencies).
    - Runtime metadata client (`createMetadataClient`) and modular metadata loading (`loadThriftMetadata`) supporting external npm packages and subpath exports.
    - Native Thrift Binary Protocol reader/writer with configurable `i64` representation (`bigint` by default, `number` optional).
    - Built-in `UUID` codec for seamless canonical UUID string serialization without external libraries.
    - Typed service exception handling and non-throwing execution via `toThriftResult` and the `THRIFT_ERRORS` symbol.
    - Built-in `createWoodyHeaders` and `createWachterHeaders` helpers with customizable header, metadata, and user identity prefixes.
  
  - **`@vality/tsthrift-cli`**:
    - Pure TypeScript Thrift compiler generating models, service definitions, and modular metadata without external Apache Thrift binaries.
    - Built-in distribution build (tsdown ESM entries with lazy chunks plus `.d.mts` declarations), optional source maps, and subpath exports (`--bundle`, `--dist`).
    - Support for external protocol namespaces (`--external`) with automated cross-package imports and collision prevention.
    - Configurable method naming (`--lower-case-methods`), `i64` representation, and duplicate module handling.
  
  - **`@vality/tsthrift-angular`**:
    - Declarative Angular DI integration (`provideThriftConfig`, `provideThriftServices`, `provideThriftService`).
    - Reactive Observable clients (`createObservableService`) retaining native request cancellation.
    - Introduced `catchThriftError` RxJS operator for type-safe pattern matching and handling of declared Thrift exceptions.
    - Angular `HttpClient` adapter (`createHttpClientFetch`) routing Thrift binary requests through Angular HTTP interceptors.
  
  ### Fixes & Improvements
  
  - Aligned generated numeric and binary serialization contracts with runtime codecs.
  - Preserved binary bodies, HTTP status errors, and request cancellation across all transports.
  - Enforced bounds on HTTP body preparation and streaming response reads to prevent memory exhaustion.
  - Prevented unowned output replacement during CLI generation and added directory safety checks.
  - Bound generated method naming and `i64` settings to metadata declarations.
  - Updated minimum runtime requirement to Node.js 24 LTS (`^24.11.0 || >=26.0.0`).
- bcaa7c3: Make metadata loads retryable, validate versioned metadata, and throw qualified service errors with cross-package brands. Bound HTTP error details, isolate logging, preserve call correlation, and accept arbitrary 128-bit UUID values. Tracing IDs keep the backend-compatible Flake layout with a random per-instance generator id; FlakeId no longer throws on clock rollback or sequence exhaustion by default (`strict: true` restores upstream behavior); remove the generateTraceId alias. Remove normalizeThriftError, THRIFT_EXCEPTION_INFO, and getThriftExceptionInfo; declared exceptions are always ThriftServiceError instances. Remove the THRIFT_RESULT symbol (use toThriftResult(client) for the non-throwing client) and export ServiceClientConfig for generated factories. Export thriftMethodName as the single IDL-to-JS method naming rule. Client wrappers are plain objects rather than Proxies. createLazyMetadataClient requires the list of method names and exposes only those methods.
