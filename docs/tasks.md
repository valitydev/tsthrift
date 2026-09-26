# Implementation checklist

The [architecture](architecture.md) records scope and compatibility decisions.
Checked items represent completed decisions or verified work, not planned features.
The initial generation pipeline is implemented. Update this file as work is completed.

Current verification: real Apache Thrift 0.24.0 generation, JS syntax checks, public
TS model type checking, metadata shape, CLI invocation, and output preservation.
HTTP/runtime execution and browser consumers are not verified. Full Damsel remains
blocked by the struct-keyed map in `accounter.InvalidPostingParams.wrong_postings`.

## 0. Agreed direction

- [x] Start with the official Apache Thrift 0.24 JS generator; the fork update does not block initial implementation.
- [x] Later switch to `valitydev/thrift` after updating and validating its JS generator, without a full fork synchronization.
- [x] Use bigint internally and retain number-based public i64 values.
- [x] Generate framework-independent JS/TS clients; leave Angular and RxJS integration to consumers.
- [x] Preserve metadata compatibility for existing form consumers.
- [x] Document architecture, compatibility boundaries, and implementation tasks.
- [x] Verify that a local 0.24 compiler emits bigint conversion calls for a small i64 fixture; runtime execution remains unverified.

## 1. Capture the existing contracts

- [ ] Pin source revisions and compiler/runtime versions used as migration baselines.
- [ ] Inventory public model exports, service signatures, connection settings, error shapes, and metadata consumers.
- [ ] Capture representative old JS, TS, metadata, and binary messages as compatibility fixtures.
- [ ] Cover external include roots, duplicate file basenames, and transitive typedefs in fixtures.
- [ ] Resolve the public binary representation from actual consumer usage and document any required migration.
- [ ] Finalize and document the unsafe-i64 policy and exact JSON representation of large IDL constants.
- [ ] Record consumer changes required by Promise clients and removal of generated Observable services and metadata$.

Acceptance: compatibility requirements and intentional API changes are explicit and
supported by reproducible fixtures.

## 2. Establish official Apache Thrift 0.24 generation

- [ ] Pin an official 0.24 compiler artifact and make its installation reproducible locally and in CI.
- [x] Generate representative fixtures with js:node,bigint and record the actual compiler version.
- [ ] Verify i64 literals, defaults, typedefs, map keys, nested containers, method arguments, results, and exceptions.
- [ ] Audit symbol-based methods, recursion helpers, UUID imports, and runtime helper requirements.
- [x] Identify differences from the fork, including object-backed maps and callback-name collisions, using real protocol fixtures and a Damsel generation attempt.
- [ ] Define lossless public Map conversion and diagnose unsupported key types or generated name collisions explicitly.
- [ ] Resolve generated thrift imports to the compatible runtime without requiring the fork-only runtime_package option.

Acceptance: the official compiler emits usable JS for supported fixtures and its
runtime requirements and compatibility limitations are explicit. A completed fork
port is not required for subsequent implementation phases.

## 3. Generate TS models and metadata in tsthrift

- [x] Reuse and pin thrift-parser 0.4.2; verify reachable include parsing and existing metadata shape against representative IDL.
- [ ] Resolve includes, namespaces, typedefs, constants, and inherited services deterministically.
- [x] Generate public TS models with number-based i64 and the agreed collection representations.
- [x] Generate metadata.json in the existing form-consumer format from the same parsed model.
- [x] Preserve optional presence, empty structures, enums, unions, and exception metadata.
- [ ] Support referenced and structured constants and finalize exact large-integer metadata handling; currently reject unsupported values.
- [ ] Verify TS/metadata agreement with the separate C++ JS generator, including transitive type references.
- [x] Produce actionable diagnostics for unresolved references, unsupported map keys, unsafe literals, callback collisions, and ambiguous outputs.
- [x] Verify deterministic metadata output and ensure include roots do not indiscriminately parse unrelated dependency fixtures.

Acceptance: types and metadata match compatibility fixtures and correctly describe
the values expected by generated JS.

## 4. Implement runtime and public clients

- [ ] Implement the Binary Protocol/runtime contract required by the official 0.24 generator, reusing suitable code with its license notices.
- [ ] Implement binary HTTP requests with dynamic headers, endpoint settings, timeout, and cancellation.
- [ ] Preserve Woody tracing/authentication headers and verify HTTP and Thrift error handling separately.
- [ ] Implement recursive number/bigint conversion for requests, responses, declared exceptions, and collection keys.
- [ ] Convert official object-backed maps and array-backed sets to and from the agreed public collections without key loss.
- [ ] Preserve empty optional structs and omit absent optional fields without changing false, zero, or empty-string values.
- [ ] Expose typed Promise-based clients without Angular or RxJS dependencies.
- [ ] Keep form metadata loading independent of RPC execution and isolate compiler-only dependencies.
- [ ] Add cross-implementation binary tests for signed i64 boundaries, binary data, collections, exceptions, and unknown fields.
- [ ] Validate malformed-message handling, recursion limits, response correlation, and resource cleanup.

Acceptance: a small generated service completes an HTTP round trip and is wire
compatible with the reference implementation; public values follow the agreed API.

## 5. Implement CLI and package output

- [x] Define CLI options for IDL inputs, include roots, namespace selection, compiler location, and output directory.
- [x] Run version-checked official 0.24.0 JS generation and TS/metadata generation through one command with actionable failures.
- [x] Support an explicit compiler executable path so the later fork switch does not require redesigning the CLI.
- [ ] Build ordinary JS/TS packages and export metadata.json independently.
- [ ] Choose package export paths and ESM/CJS support using actual consumer requirements.
- [ ] Validate generated references and fail before packaging unresolved imports.
- [x] Keep output cleanup scoped to generated files and preserve previous output when generation fails; reject unmanaged output and additional user files.
- [ ] Verify installation of a packed generated package in an isolated consumer.
- [ ] Replace starter package metadata and examples once the real API and CLI exist.

Acceptance: one reproducible command produces an installable protocol package with
working declarations, runtime imports, and metadata exports.

## 6. Validate real consumers and migrate

- [ ] Generate Damsel using the existing include roots and namespace selection.
- [ ] Validate another protocol package with external includes and transitive typedefs.
- [ ] Compare emitted metadata and public model declarations with the captured baseline.
- [ ] Integrate Promise clients into control-center's consumer-owned service layer.
- [ ] Adapt metadata loading and retain ng-thrift's existing schema interpretation.
- [ ] Browser-test forms, including empty optional structs, and actual request/response decoding.
- [ ] Verify timeout, cancellation, authentication refresh, and declared/HTTP errors in the consumer.
- [ ] Confirm rebuilt packages no longer embed woody_js or generated Angular/RxJS wrappers.
- [ ] Document migration steps, remaining incompatibilities, and reproducible CI checks.

Acceptance: real package generation and consumer runtime behavior are verified.
Compiler or application type checks alone do not establish runtime compatibility.

## 7. Update the fork's JS generator and switch compilers

This work can proceed independently and does not block phases 2–6 for protocols
supported by the official compiler.

- [ ] Compare the current fork with the pinned upstream 0.24 JS generator and identify compiler dependencies.
- [ ] Port JS generator changes without modifying unrelated language generators.
- [ ] Preserve Map generation, runtime_package, and callback-name collision fixes, retaining license notices.
- [ ] Support opt-in js:node,bigint generation and verify legacy generation remains usable.
- [ ] Build the compiler and run focused JS generator tests, including regressions for retained fork behavior.
- [ ] Make the compiler artifact reproducible in CI and identify it as a fork with an updated JS generator.
- [ ] Adapt internal collection conversion to the fork's output while preserving the public API.
- [ ] Run the same model, metadata, binary compatibility, and consumer checks against the updated fork.
- [ ] Switch the pinned compiler to the updated fork and verify previously unsupported protocols.

Acceptance: the fork replaces the official compiler without changing the agreed
public data representations or wire protocol. Revalidate runtime behavior after
the switch; source comparison alone does not complete this phase.

## Deferred beyond the first working replacement

- [ ] Evaluate removing the Int64 bridge once the generator/runtime pair is stable.
- [ ] Consider a public bigint API only as a separate consumer migration.

Full upstream fork synchronization and framework-specific generators are outside
the current scope.
