---
"@vality/tsthrift": minor
"@vality/tsthrift-cli": minor
"@vality/tsthrift-angular": minor
---

### Features

- **`@vality/tsthrift`**:
  - Web Standards First Thrift runtime and client for modern browsers, Web Workers, and Node.js (zero Node-specific runtime dependencies).
  - Runtime metadata client (`createMetadataClient`) and modular metadata loading (`loadThriftMetadata`) supporting external npm packages and subpath exports.
  - Native Thrift Binary Protocol reader/writer with configurable `i64` representation (`bigint` by default, `number` optional).
  - Built-in `UUID` codec for seamless RFC 4122 string serialization without external libraries.
  - Typed service exception handling and non-throwing execution via `toThriftResult`, `THRIFT_ERRORS`, and `THRIFT_RESULT` symbols.
  - Woody RPC tracing headers injection and context propagation (`mergeHeaderProviders`).

- **`@vality/tsthrift-cli`**:
  - Pure TypeScript Thrift compiler generating models, service definitions, and modular metadata without external Apache Thrift binaries.
  - Built-in bundling support with minification, sourcemaps, and subpath exports (`--bundle`, `--dist`).
  - Support for external protocol namespaces (`--external-namespace`) with automated cross-package imports and collision prevention.
  - Configurable method naming (`--lower-case-methods`), `i64` representation, and duplicate module handling.

- **`@vality/tsthrift-angular`**:
  - Declarative Angular DI integration (`provideThriftConfig`, `provideThriftServices`, `provideThriftService`).
  - Reactive Observable clients (`createObservableService`, `toObservableClient`) retaining native request cancellation.
  - Introduced `catchThriftError` RxJS operator for type-safe pattern matching and handling of declared Thrift exceptions.
  - Angular `HttpClient` adapter (`createHttpClientFetch`) routing Thrift binary requests through Angular HTTP interceptors.

### Fixes & Improvements

- Aligned generated numeric and binary serialization contracts with runtime codecs.
- Preserved binary bodies, HTTP status errors, and request cancellation across all transports.
- Enforced bounds on HTTP body preparation and streaming response reads to prevent memory exhaustion.
- Prevented unowned output replacement during CLI generation and added directory safety checks.
- Bound generated method naming and `i64` settings to metadata declarations.
- Updated minimum runtime requirement to Node.js 24 LTS (`>=24.0.0`).
