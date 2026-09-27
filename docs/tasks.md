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
- [x] Design per-module/per-namespace metadata splitting for lazy on-demand loading in dynamic forms (--split-metadata).

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

## Native TypeScript backend (runtime via metadata.json)

- [x] Streamline native execution to runtime `metadata.json` via `createMetadataClient` (removed static native codegen).
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
- [x] Default CLI generation to TypeScript models and `metadata.json` (`--no-models` for metadata only).
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

## React / TanStack Query output

- [x] Keep the Promise core independent of React and TanStack imports.
- [x] Generate typed query/mutation options with explicit method classification.
- [x] Forward query AbortSignal to the HTTP request.
- [x] Normalize bigint, Map, Set, binary, endpoint, and tenant scope into deterministic cache keys.
- [x] Verify cancellation, cache isolation, mutation behavior, and SSR value serialization.
- [x] Package the adapter as an optional entry (@vality/tsthrift/query) without mandatory external peers.

## Angular output and integration

- [x] Add an Angular service generator over the shared Promise core (emitProgramClients and emitServicesRegistry).
- [x] Use modern Angular DI (InjectionToken and provideThriftClient provider factories) instead of legacy Observable<ConnectOptions> constructor.
- [x] Provide Promise-based service methods (compatible with Angular Signals and Resource API) with optional defer() RxJS helpers for Observable consumers.
- [x] Support HttpClient transport injection without Angular imports in core.
- [x] Preserve service exports, namespace exports, error types, and logging/call-option helpers.
- [x] Support explicit number-mode generation for existing numeric consumer contracts.
- [ ] Verify configuration updates, lifecycle, cancellation, and lazy loading in live consumers.
- [ ] Compile Angular package format when emitting decorated services.

## Package output

- [x] Emit installable protocol packages with JS, declarations, metadata, and stable exports (--package).
- [x] Keep compiler output selection separate from framework adapter selection.
- [ ] Verify ESM/CJS and optional framework entries in isolated consumers.
- [ ] Rebuild protocol artifacts before migrating applications that currently bundle woody_js.

## Binary runtime

- [x] Implement primitive/envelope reading and writing, scalar i64 guards, and bounded skipping.
- [x] Cross-decode with Apache 0.24 and test malformed inputs and limits.
- [x] Export the binary runtime independently of Node/compiler/parser imports.

The native backend uses this runtime. Apache remains available as a comparison
backend; consumer acceptance is tracked separately above.
