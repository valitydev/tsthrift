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
- [x] Verify 15 selected Damsel model modules in both modes and compare legacy metadata.
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
- [x] Confirm stock ES6 JS still loses struct map keys; retain the generation guard.
- [ ] Implement and validate a bounded map compatibility transformation and matching runtime helpers.
- [ ] Cover map reads/writes, constructors, defaults, constants, scalar/structured keys, nested maps, and reserved property names.
- [ ] Preserve recursive public Map/Set/plain-object conversion to and from generated classes.
- [ ] Add declared-exception and i64 mode conversion at the public client boundary.
- [ ] Cover transitive typedef imports and generated identifier collisions beyond callback.
- [ ] Package generated JS with a compatible browser runtime, bigint helpers, and required polyfills.
- [ ] Generate the full Damsel client set without losing map keys.
- [ ] Make compiler acquisition reproducible in CI.

Acceptance: generated clients preserve existing wire and public value contracts;
stock generation success alone is insufficient.

## Woody-compatible transport and Promise clients

- [ ] Reuse Apache serialization/runtime contracts and replace HTTP I/O.
- [ ] Provide a request transport seam for fetch or framework HTTP adapters.
- [ ] Preserve endpoint settings, binary content type, per-call headers, auth, and tracing.
- [ ] Implement AbortSignal cancellation, timeout, and pending-request cleanup.
- [ ] Validate response method/type/sequence and distinguish HTTP, network, application, and declared errors.
- [ ] Preserve compatibility error exports/context and logging hooks.
- [ ] Preserve absent fields and present empty structs during conversion.
- [ ] Cross-decode generated messages with the legacy Vality runtime.
- [ ] Exercise one real HTTP service before claiming transport compatibility.

## React / TanStack Query output

- [ ] Keep the Promise core independent of React and TanStack imports.
- [ ] Generate typed query/mutation options with explicit method classification.
- [ ] Forward query AbortSignal to the HTTP request.
- [ ] Normalize bigint, Map, Set, binary, endpoint, and tenant scope into deterministic cache keys.
- [ ] Verify cancellation, cache isolation, mutation behavior, and SSR value serialization.
- [ ] Package the adapter as an optional entry with explicit peer dependencies.

## Angular output and compatibility profile

- [ ] Add an optional Angular/service build profile over the same Promise core.
- [ ] Preserve service exports, Observable methods, ConnectOptions$ construction, and metadata$.
- [ ] Preserve namespace exports, errors, logging, createCallOptions, and tracing ID helpers where consumed.
- [ ] Use explicit number-mode generation for the existing numeric consumer contract.
- [ ] Support provider factories and HttpClient transport injection without Angular imports in core.
- [ ] Verify configuration updates, subscription lifecycle, cancellation, and lazy loading.
- [ ] Compile the Angular package format when emitting decorated services.
- [ ] Build existing consumers and browser-test forms and requests.

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
