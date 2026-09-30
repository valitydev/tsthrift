# @vality/tsthrift-cli

## 0.1.0

### Minor Changes

- bcaa7c3: Emit retryable runtime loaders, explicit method allowlists, build compatibility markers, qualified exception types. Fields without an explicit requiredness are typed as present, as in the legacy generator; only `optional` fields and union members are optional. Such fields are marked with `/** @remarks requiredness */`. Stop emitting the `<Service>Descriptor` alias and the per-service `<Service>Config` interface (factories take `ServiceClientConfig` from `@vality/tsthrift`), and drop the `[THRIFT_RESULT]` member from service interfaces (use `toThriftResult(client)`). The package API is limited to `generate` and its option types; internal emitters and the `./cli` subpath are no longer exported. `--external` reads modules only from the installed package metadata and never parses their `.thrift` sources (`--include` compiles sources locally); `--external <package>` maps every module of an installed protocol package. Validate installed external build settings before bundling; `--bundle` builds a modern ESM package with tsdown (`.mjs` entries with lazy split chunks, unminified, bundled `.d.mts` declarations), with source maps only via `--sourcemap` and require a supported Node toolchain.
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

### Patch Changes

- Updated dependencies [bcaa7c3]
- Updated dependencies [bcaa7c3]
  - @vality/tsthrift@0.1.0
