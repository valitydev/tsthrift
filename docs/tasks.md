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
- [ ] Support exact large-integer IDL constants without changing legacy metadata silently.
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
- [x] Cross-decode complete native messages with the legacy Vality runtime (valitydev/thrift C++ fork).

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
- [x] Cross-decode generated messages with the legacy Vality runtime (valitydev/thrift C++ fork).
- [x] Provide browser-first Woody RPC tracing headers generator (`WOODY_HEADERS`, `createWoodyHeaders`, `createWoodyHeaderProvider`, `generateId`, `generateTraceId`, `FlakeId`, `bs64`) compatible with upstream `frontend-thrift-codegen/tools/static/utils/generate-id.ts` (64-bit Flake ID + base-x base64 encoding) and automatic `woody` option in `HttpTransportConfig`.
- [x] Exercise one real HTTP service before claiming transport compatibility.

## React / TanStack Query output (deferred / YAGNI)

- [x] Keep core runtime and CLI completely independent of React and TanStack imports.
- [x] Omit unused React / TanStack Query packages until explicitly needed by consumers.

## Angular integration (@vality/tsthrift-angular)

- [x] Extract Angular integration into a dedicated standalone workspace package (`@vality/tsthrift-angular`).
- [x] Keep CLI output completely framework-agnostic (`services/` and `services.ts` contain no Angular imports or tokens).
- [x] Exclude the word "Client" from generated service files, service factories (`create${ServiceName}`, `createAsync${ServiceName}`), configs (`${ServiceName}Config`), and model classes (`export abstract class ${ServiceName}`).
- [x] Provide dynamic and cached DI tokens via `getServiceToken(descriptor)` and `createServiceToken(descriptor)`.
- [x] Implement modern Angular environment providers (`provideThriftConfig`, `provideThriftServices`, `provideThriftService`).
- [x] Provide Promise-based service methods (compatible with Angular Signals and Resource API) with `toObservableClient` and `deferThriftCall` RxJS helpers for Observable consumers.
- [x] Support HttpClient transport injection (`createHttpClientFetch`) without Angular imports in core runtime.
- [x] Support explicit number-mode generation for existing numeric consumer contracts.
- [ ] Verify configuration updates, lifecycle, cancellation, and lazy loading in live consumers.

## Package output

- [ ] Emit installable protocol packages with JS, declarations, metadata, and stable exports (--package).
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
- [x] End-to-end wire parity, byte-for-byte serialization equality, and bidirectional RPC execution with Vality Thrift fork (`valitydev/thrift` v0.20.1) and Apache 0.24.0 Java clients/processors.
- [x] Execute latest Damsel Repository.Commit against unmodified generated Java clients/processors, comparing complete binary messages and retaining composite map keys in both numeric modes (see conformance.md).
- [x] Compare every supported value type, empty/absent values, exceptions, and colliding service/IDL namespace names against generated Java execution, isolated in a dedicated two-variant GitHub Actions CI conformance matrix (Vality 0.20.1 and Apache 0.24.0) with pinned Damsel SHA and artifact uploads on failure.
- [x] Verify binary protocol on large nested composite objects (360+ node tree with unions, composite map keys, binary payloads, and sets; exact byte-for-byte parity with Apache 0.24, bidirectional RPC roundtrip, and deep recursion bounds).
- [x] Verify binary protocol on RPC methods with diverse argument types (14 simultaneous scalar and composite arguments: byte, i16, i32, i64, double, bool, string, binary, list, set, map, struct, union, optional; exact byte-for-byte wire parity with Apache 0.24, server decoding, and permuted field IDs).
- [x] Export the binary runtime independently of Node/compiler/parser imports.

The native backend uses this runtime. Apache remains available as a comparison
reference in tests; consumer acceptance is tracked separately above.

## Release audit follow-up

- [ ] Propagate generated i64 mode into client factories and prevent conflicting runtime overrides.
- [ ] Align generated binary types and constants with the native Uint8Array contract.
- [ ] Preserve cancellation, timeout, and HTTP error semantics in the Angular adapter.
- [ ] Merge HTTP headers case-insensitively and bound asynchronous header resolution.
- [ ] Resolve generated export/path collisions and validate defaults/effective field IDs before publication.
- [ ] Verify generated-package build, installation, and regeneration as one supported workflow.
- [ ] Reject malformed hex input without partial decoding.

See [release audit](release-audit.md) for reproductions and verification gaps.
