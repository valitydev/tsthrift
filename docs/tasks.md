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
- [ ] Resolve public binary conversion from existing consumers.
- [ ] Validate metadata in actual form consumers.

Do not recreate thrift-parser's grammar test suite. Add cases when they expose a
project integration defect or a consumer contract that needs protection.

## Apache JS backend and compatibility

- [x] Generate internal JS with official Apache 0.24 and explicit executable selection.
- [x] Use js:node,es6,bigint to avoid the extra callback parameter without a C++ patch.
- [x] Execute callback-named arguments and declared errors through generated Promise clients/processors.
- [x] Record generator flags and i64 mode in generation.json.
- [x] Audit thrift-ts, frontend-thrift-codegen, woody_js, the Vality fork, and existing Angular consumers.
- [x] Confirm stock ES6 JS still loses struct map keys; decided to update Vality C++ fork for native Map generation instead of AST transforms in tsthrift.
- [ ] Integrate and verify updated Vality Thrift compiler fork (Apache 0.24 + native Map generation).
- [ ] Verify struct-keyed maps with composite keys using the updated compiler.
- [x] Implement recursive public plain-object (typed JSON) to/from generated class instance conversion.
- [x] Add declared-exception and i64 mode conversion at the public client boundary.
- [ ] Cover transitive typedef imports and generated identifier collisions beyond callback.
- [ ] Package generated JS with a compatible browser runtime, bigint helpers, and required polyfills.
- [ ] Generate full client sets for complex reference schemas without losing map keys.
- [ ] Make compiler acquisition reproducible in CI.

Acceptance: generated clients preserve existing wire and public value contracts;
stock generation success alone is insufficient.

## Woody-compatible transport and Promise clients

- [x] Reuse Apache serialization/runtime contracts and replace HTTP I/O.
- [x] Implement declarative client initialization (ThriftClientConfig) with endpoint, timeout, static/dynamic header providers, and fetch/custom transport adapter.
- [x] Support direct static metadata import and Promise loader (eliminating legacy Observable metadata$ requirement).
- [x] Provide a request transport seam for fetch or framework HTTP adapters.
- [x] Implement AbortSignal cancellation, enforced timeout (AbortSignal.timeout/any), and pending-request socket teardown.
- [x] Reject non-200 HTTP responses (4xx/5xx) and invalid Content-Types immediately before Thrift decoding (prevent hung 500/HTML requests).
- [x] Validate response method/type/sequence and distinguish HTTP, network, timeout, and declared application errors.
- [ ] Preserve compatibility error exports/context and logging hooks.
- [x] Preserve absent fields and present empty structs during conversion.
- [ ] Cross-decode generated messages with the legacy Vality runtime.
- [x] Exercise one real HTTP service before claiming transport compatibility.

## React / TanStack Query output (deferred)

- [ ] Keep the Promise core independent of React and TanStack imports.
- [ ] Generate typed query/mutation options with explicit method classification.
- [ ] Forward query AbortSignal to the HTTP request.
- [ ] Normalize bigint, Map, Set, binary, endpoint, and tenant scope into deterministic cache keys.
- [ ] Verify cancellation, cache isolation, mutation behavior, and SSR value serialization.
- [ ] Package the adapter as an optional entry with explicit peer dependencies.

## Angular output and integration

- [ ] Add an Angular service generator over the shared Promise core.
- [ ] Use modern Angular DI (InjectionToken and provideThriftClient provider factories) instead of legacy Observable<ConnectOptions> constructor.
- [ ] Provide Promise-based service methods (compatible with Angular Signals and Resource API) with optional defer() RxJS helpers for Observable consumers.
- [ ] Support HttpClient transport injection without Angular imports in core.
- [ ] Preserve service exports, namespace exports, error types, and logging/call-option helpers.
- [ ] Support explicit number-mode generation for existing numeric consumer contracts.
- [ ] Verify configuration updates, lifecycle, cancellation, and lazy loading.
- [ ] Compile Angular package format when emitting decorated services.

## Package output

- [ ] Emit installable protocol packages with JS, declarations, metadata, and stable exports.
- [ ] Keep compiler output selection separate from framework adapter selection.
- [ ] Verify ESM/CJS and optional framework entries in isolated consumers.
- [ ] Rebuild protocol artifacts before migrating applications that currently bundle woody_js.

## Existing experimental binary runtime

- [x] Implement primitive/envelope reading and writing, scalar i64 guards, and bounded skipping.
- [x] Cross-decode with Apache 0.24 and test malformed inputs and limits.
- [x] Export the experimental runtime independently of Node/compiler/parser imports.

This experiment is not the production client backend. Further native codec
implementation is deferred while the Apache-backed compatibility path is evaluated.
