# @vality/tsthrift-cli

## 0.2.0

### Minor Changes

- cba5c75: Represent IDL binary values as Base64 strings by default (`--binary base64`). Add `--binary uint8array`
  and `MetadataClientConfig.binaryMode` for raw byte values. Keep generated models,
  constants, defaults, service factories, and metadata settings consistent, and reject
  incompatible external package modes. Binary Protocol still transmits raw bytes;
  IDL string remains UTF-8 text. Regenerate protocol packages to adopt the new default.
- cba5c75: Rename the generated root loader to `loadThriftMetadataByNamespaces` and accept a required namespace name or readonly list of names. Arguments are restricted to the generated `THRIFT_NAMESPACES` union. Pass `THRIFT_NAMESPACES` to load all available namespaces. Combined results deduplicate shared dependencies while preserving per-namespace caching and retries. Runtime loader factories infer allowed names from their dependency keys.
  
  Namespace-local `loadThriftMetadata()` keeps its name and zero-argument signature. Update root imports to use the new name; runtime and CLI loading continue to accept older external packages exporting `loadThriftMetadata`.
  
  When providing a root loader to a metadata client, use an explicit selection callback such as `metadata: () => loadThriftMetadataByNamespaces("payment")`.
- cba5c75: Preserve generated module directories and filenames in `--bundle` output, including namespace-local model declarations and service modules. Root and namespace entry points remain available, metadata imports remain lazy, and installed dependencies remain external.
- cba5c75: Export `THRIFT_NAMESPACES` from generated package roots as an alphabetically sorted readonly tuple of local and external module names supported by `loadThriftMetadata`. Reading the list does not invoke metadata loaders.

### Patch Changes

- Updated dependencies [cba5c75]
- Updated dependencies [cba5c75]
- Updated dependencies [cba5c75]
- Updated dependencies [cba5c75]
  - @vality/tsthrift@0.2.0

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
