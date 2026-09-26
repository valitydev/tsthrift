# Implementation checklist

The [architecture](architecture.md) defines the current scope. Checked items are
completed decisions or verified work. Keep source generation, runtime execution,
and consumer verification distinct.

## 0. Agreed direction

- [x] Port compatible metadata generation first, independently of an external compiler.
- [x] Build the native JS/TS serialization and RPC generator on the same schema next.
- [x] Keep Apache Thrift 0.24 as an optional reference; remove the C++ fork update from the critical path.
- [x] Emit full exported enums with runtime values and reverse mappings.
- [x] Keep public i64 as number and use bigint internally in serialization.
- [x] Leave Angular, RxJS integration, and form rendering to consumers.

## 1. Standalone metadata generation

- [x] Pin thrift-parser 0.4.2 and reuse the legacy metadata representation.
- [x] Resolve selected input files and reachable include roots without scanning unrelated dependency fixtures.
- [x] Separate common schema validation from Apache JS restrictions.
- [x] Add a metadata-only CLI target with no external compiler dependency.
- [x] Preserve paths, namespaces, typedefs, defaults, optionality, empty structs, unions, enums, exceptions, and services.
- [x] Commit a compatibility fixture produced by the old generator and compare it in tests.
- [x] Generate metadata for all 15 reachable Damsel modules selected by the existing build and compare with the old generator.
- [x] Preserve prior output on failure and refuse unmanaged or additional user files.
- [ ] Finalize exact large-integer constant representation instead of relying on legacy parser numbers.
- [ ] Add broader parser fixtures for annotations, duplicate declarations, recursive types, and constant expressions.
- [ ] Verify metadata directly in existing ng-thrift forms.

Acceptance: metadata matches the existing format without requiring JS generation.
The Damsel comparison passed; live Angular form verification remains pending.

## 2. Public models and runtime enums

- [x] Generate number-based public i64, object-shaped structures, Map, Set, and arrays.
- [x] Emit ordinary exported enums with explicit/implicit numeric values, negative values, and aliases.
- [x] Compile generated enums to JavaScript and execute forward/reverse lookup tests.
- [x] Verify declaration output preserves the enum API.
- [x] Support struct-keyed maps and callback-named arguments in public models.
- [x] Avoid built-in collection type collisions, including Damsel's Array typedef.
- [x] Type-check the 15 generated Damsel model modules.
- [ ] Emit referenced and structured constants as executable model values; preserve them in metadata in the meantime.
- [ ] Resolve the public binary representation from actual consumer usage.
- [ ] Define stable public factory names and package export paths for the native client API.

Acceptance: models and enums are usable TS sources, and enums exist after JS
compilation. This does not yet provide executable RPC clients.

## 3. Native serialization and RPC generation

- [ ] Resolve internal field IDs, wire types, typedefs, defaults, recursive references, and inherited services without mutating legacy metadata.
- [ ] Generate serialization and deserialization for primitives, enums, structs, unions, and exceptions.
- [ ] Generate collection codecs using native Map and Set, including struct-keyed maps.
- [ ] Serialize i64 with bigint internally and apply checked number conversion at the public boundary.
- [ ] Generate method argument/result structures and declared exception handling.
- [ ] Generate typed Promise-based client implementations without Angular or RxJS.
- [ ] Validate names and imports, including transitive references and collisions with generated identifiers.
- [ ] Complete one small end-to-end generated service before expanding coverage to Damsel.

Acceptance: a native generated client encodes a request and decodes a compatible
response without invoking Apache Thrift during generation.

## 4. Runtime and wire compatibility

- [ ] Implement a browser-compatible Thrift Binary Protocol runtime, reusing suitable code with its license notices where useful.
- [ ] Implement binary HTTP requests with dynamic headers, endpoint settings, timeout, and cancellation.
- [ ] Preserve Woody authentication/tracing conventions and distinguish HTTP, application, and declared errors.
- [ ] Preserve empty optional structs and absent fields without losing false, zero, or empty-string values.
- [ ] Validate response correlation, unknown-field skipping, recursion limits, malformed messages, and cleanup.
- [ ] Cross-decode native messages with a reference runtime and reference messages with the native runtime.
- [ ] Cover signed i64 boundaries, binary values, exceptions, nested collections, and complex map keys.
- [ ] Keep runtime dependencies independent of compiler/parser packages and form metadata loading.

Acceptance: real HTTP exchange and cross-implementation wire tests pass. Matching
source output or self-round-trip tests alone are insufficient.

## 5. CLI and package output

- [x] Implement input, include root, namespace, output directory, and target selection.
- [x] Default to models plus metadata; make external compiler execution opt-in.
- [x] Retain the version-checked Apache target with explicit executable selection for comparisons.
- [x] Record target and reference compiler details in generation.json.
- [x] Remove stale owned output when switching generation targets.
- [ ] Build installable protocol packages with JS, declarations, and an independent metadata export.
- [ ] Choose ESM/CJS support from consumer requirements and verify a packed package in an isolated consumer.
- [ ] Add native codec/client output to the CLI once implemented.
- [ ] Document consumer migration from Observable service wrappers and metadata$.

Acceptance: one command produces an installable native protocol package with
working runtime imports, declarations, enums, and metadata.

## 6. Reference compiler and real consumers

- [x] Verify real Apache 0.24 bigint JS generation and generated JS syntax on supported fixtures.
- [x] Isolate object-map, callback, and file-collision restrictions to the Apache target.
- [ ] Make the optional reference compiler/runtime installation reproducible in CI.
- [ ] Capture baseline binary messages and observable error behavior.
- [ ] Generate native codecs and clients for Damsel using its existing namespace selection.
- [ ] Validate another protocol package with external includes and transitive typedefs.
- [ ] Integrate native Promise clients into control-center's consumer-owned service layer.
- [ ] Browser-test forms, actual request decoding, timeout, cancellation, and authentication refresh.
- [ ] Confirm rebuilt packages no longer embed woody_js or generated Angular/RxJS wrappers.

Acceptance: real protocol package generation and consumer behavior are verified.
Damsel metadata/models already pass; native RPC and browser verification are pending.

## Deferred or outside the current scope

- [ ] Consider a public bigint API only as a separate consumer migration.

Updating the Vality C++ JS generator is no longer a prerequisite or a planned
production dependency. Full fork synchronization and framework-specific generators
are outside the current implementation scope.
