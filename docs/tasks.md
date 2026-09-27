# Implementation checklist

Checked entries represent implemented and verified project behavior. Architecture
choices are described in [architecture](architecture.md); compatibility evidence
and source revisions are in [compatibility](compatibility.md).

## Metadata and models

- [x] Resolve selected entries and reachable includes using the pinned legacy parser.
- [x] Emit the legacy metadata artifact independently of JS generation.
- [x] Keep one consumer-contract fixture from the old generator and test emitted metadata against it.
- [x] Generate TS models, runtime enums, references, constants, struct defaults, and nested collections.
- [x] Default public i64 to bigint and provide explicit --i64 number compatibility mode.
- [x] Compile and execute both numeric modes; keep metadata unchanged between them.
- [x] Verify 15 complex reference IDL modules in both modes and compare legacy metadata.
- [x] Preserve staged output, ownership checks, and rollback behavior.
- [x] Support exact large-integer IDL constants without changing legacy metadata silently.
- [x] Resolve public binary conversion from existing consumers (toBinary, binaryToString, isBinary).
- [ ] Validate metadata in actual form consumers (@vality/ng-thrift and control-center).
- [x] Support minified metadata artifact output for production releases while keeping formatted fixtures for tests (--minify).
- [x] Implement modular metadata emission (`metadata/`) and compile-time transitive dependency loader (`loadMetadata`) in TypeScript modules; emit monolithic JSON only with explicit `--metadata-json`.

Do not recreate thrift-parser's grammar test suite. Add cases when they expose a
project integration defect or a consumer contract that needs protection.

## Runtime metadata clients

- [x] Create Promise clients from metadata alone with no generated source modules.
- [x] Support static metadata, Promise/module loaders, and one-time schema initialization.
- [x] Resolve includes, container typedef scope, recursive structs, defaults, and inheritance.
- [x] Reuse native codecs, byte transport, response validation, and exception handling.
- [x] Cross-decode metadata-only calls with Apache and execute HTTP in both i64 modes.
- [x] Execute a metadata-only browser bundle with Node globals absent and string code generation disabled.
- [x] Initialize all 14 reference clients directly from 15 metadata modules in both modes.

## Native TypeScript backend (runtime via metadata / loadMetadata)

- [x] Streamline native execution to runtime metadata via `createMetadataClient` (removed static native codegen).
- [x] Preserve struct-keyed maps, Set, plain structs, empty optional values, and recursive types.
- [x] Resolve transitive typedef imports, container scopes, and inherited service methods in metadata.
- [x] Select request options by argument position, including callback/options/params-named data.
- [x] Enforce required fields, decode limits, response correlation, and declared/application errors.
- [x] Execute native clients in both i64 modes with independent Apache wire decoding.
- [x] Execute native metadata clients through real local HTTP, cancellation, and timeout.
- [x] Execute a browser-targeted bundle without Node globals or Apache/Buffer imports.
- [x] Remove Apache/Buffer runtime dependencies; retain Apache only as a test wire reference.
- [ ] Validate native clients in live browsers and existing Angular/form consumers.
- [ ] Cross-decode complete native messages with the legacy Vality runtime.

## Apache JS backend (removed in favor of metadata runtime)

- [x] Removed Apache 0.24 JS compilation, wrapper generation, and `@vality/tsthrift/apache` runtime.
- [x] Default CLI generation to TypeScript models, modular metadata, and client factories (`--metadata-json` for monolithic JSON, `--no-models` for metadata only).
- [x] Streamline RPC execution to pure metadata client (`createMetadataClient`) and native Binary Protocol.
- [x] Retain official Apache 0.24 wire protocol cross-decoding as a test-only reference for binary format verification.

Acceptance: generated clients preserve existing wire and public value contracts;
stock generation success alone is insufficient.

## Woody-compatible transport and Promise clients

- [x] Reuse Apache serialization/runtime contracts and replace HTTP I/O.
- [x] Implement declarative client initialization (ThriftClientConfig) with endpoint, timeout, static/dynamic header providers, and fetch/custom transport adapter.
- [x] Support direct static metadata import and Promise loader (eliminating legacy Observable metadata$ requirement).
- [x] Provide a request transport seam for fetch or framework HTTP adapters.
- [x] Implement AbortSignal cancellation, enforced timeout via an AbortController, and pending-request socket teardown.
- [x] Reject non-200 HTTP responses (4xx/5xx) and invalid Content-Types immediately before Thrift decoding (prevent hung 500/HTML requests).
- [x] Validate response method/type/sequence and distinguish HTTP, network, timeout, and declared application errors.
- [x] Preserve compatibility error exports/context and logging hooks.
- [x] Preserve absent fields and present empty structs during conversion.
- [ ] Cross-decode generated messages with the legacy Vality runtime.
- [x] Exercise one real HTTP service before claiming transport compatibility.

## React / TanStack Query output (deferred / YAGNI)

- [x] Keep core runtime and CLI completely independent of React and TanStack imports.
- [x] Omit unused React / TanStack Query packages until explicitly needed by consumers.

## Angular integration (@vality/tsthrift-angular)

- [x] Extract Angular integration into a dedicated standalone workspace package (`@vality/tsthrift-angular`).
- [x] Keep CLI output completely framework-agnostic (`clients/` and `services.ts` contain no Angular imports or tokens).
- [x] Provide dynamic and cached DI tokens via `getServiceToken(descriptor)` and `createServiceToken(descriptor)`.
- [x] Implement modern Angular environment providers (`provideThriftConfig`, `provideThriftServices`, `provideThriftClient`).
- [x] Provide Promise-based service methods (compatible with Angular Signals and Resource API) with `toObservableClient` and `deferThriftCall` RxJS helpers for Observable consumers.
- [x] Support HttpClient transport injection (`createHttpClientFetch`) without Angular imports in core runtime.
- [x] Support explicit number-mode generation for existing numeric consumer contracts.
- [ ] Verify configuration updates, lifecycle, cancellation, and lazy loading in live consumers.

## Package output

- [x] Emit installable protocol packages with JS, declarations, metadata, and stable exports (--package).
- [x] Keep compiler output selection separate from framework adapter selection.
- [ ] Verify ESM/CJS and optional framework entries in isolated consumers.
- [ ] Rebuild protocol artifacts before migrating applications that currently bundle woody_js.

## Binary runtime

- [x] Implement primitive/envelope reading and writing, scalar i64 guards, and bounded skipping.
- [x] Cross-decode with Apache 0.24 and test malformed inputs and limits.
- [x] Byte-for-byte exact comparison between our BinaryWriter and Apache 0.24 TBinaryProtocol on complex nested structs, struct-keyed maps, binary buffers, UTF-8, and i64 limits.
- [x] Bidirectional cross-decoding across complex data structures (we write -> Apache decodes; Apache writes -> we decode).
- [x] Full RPC method envelope verification (CALL, REPLY success, REPLY declared exception, Application Exception, and ONEWAY).
- [x] End-to-end RPC client execution from metadata with complex data structures against Apache wire codecs.
- [x] Export the binary runtime independently of Node/compiler/parser imports.

The native backend uses this runtime. Apache remains available as a comparison
reference in tests; consumer acceptance is tracked separately above.
