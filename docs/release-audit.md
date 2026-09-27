# Release readiness audit

Date: 2026-09-27. Decision: not ready for a stable release of all advertised features.
Production implementation was not changed by this audit. Follow-up conformance tests and
documentation were added; standalone defect reproductions ran outside the repository.

## Verified baseline

- `vp install`: succeeded without tracked dependency changes.
- `vp check`: formatting, lint, and type checks passed.
- `vp test`: 19 files, 121 tests passed.
- `vp run -r test`: package suites and the root suite passed.
- `vp pack` executed directly in each of the three packages, bypassing task cache.
- Each package was packed with pnpm and installed from its tarball into an isolated directory.
- Core, runtime, CLI, and Angular ESM imports and Node `require()` imports succeeded on Node 24.21.0. This does not establish a legacy CommonJS build or support for older Node versions.
- Installed `tsthrift-cli --help` succeeded.
- Production dependency audit reported zero known advisories.
- Damsel revision `8d6174bddedc6d9aefa407fdc1d54877b8686ff9`: 15 modules compiled and 14 metadata clients initialized in each numeric mode.
- Existing tests exercised Apache wire comparison, loopback HTTP, malformed binary messages, and isolated browser-targeted bundles.
- `git diff --check` passed. The initial audit started from a clean working tree.
- Follow-up latest-Damsel conformance: nine cases passed against unmodified Apache-generated Java clients/processors; see [conformance](conformance.md).

## P1: generated numeric mode disagrees with runtime

Source: `packages/cli/src/compiler/emit-clients.ts:32-50`, called from `generate.ts:75`.

Generate `service Example { i64 next(1: i64 value) }` with `i64: "number"`.
The generated model accepts `number`, but neither factory embeds the generation mode.
`createExampleClient({ endpoint, transport }).next(42)` rejects with
`Expected signed i64 bigint, got 42` before calling transport. Decoding an i64 reply
returns bigint even though the generated return declaration says number.
The generated descriptor uses the same factory, affecting Angular consumers too.

Required change: bind both factories and descriptors to the generated mode and prevent
configuration from selecting a conflicting mode. Execute the generated factories in both modes.

## P1: binary models and constants disagree with runtime

Source: `packages/cli/src/compiler/emit-models.ts:37-40`, `generate.ts:62`;
`packages/tsthrift/src/codecs/scalar.ts:54-63`.

`service Example { binary echo(1: binary value) }` generates a string argument and
`Promise<string>`. A type-correct call with `"abc"` fails with `Expected Uint8Array`.
Binary constants are also emitted as strings. The Uint8Array emission option exists
but is never selected by the generation orchestration.

Required change: emit types and constants matching the native Uint8Array contract.
The historical string declaration in thrift-ts does not justify an internally
inconsistent new typed client. Document consumer migration separately.

## P1: Angular adapter ignores cancellation and timeout

Source: `packages/angular/src/http-client-fetch.ts:30-43`.

The adapter ignores `init.signal` and awaits `firstValueFrom` without linking abort to
subscription disposal. A 100 ms Observable with a 5 ms transport timeout resolved
successfully after approximately 116 ms. A never-emitting Observable remained pending
after both caller abort and timeout, with its teardown uncalled.

Required change: connect AbortSignal to subscription disposal, reject on cancellation,
and clean up listeners on all completion paths. Test both caller abort and timeout.
Angular documents that unsubscribing aborts the HTTP request:
https://angular.dev/guide/http/making-requests#http-observables

## P2: Angular HTTP failures lose their public status/error contract

Source: `packages/angular/src/http-client-fetch.ts:38`;
`packages/tsthrift/src/transport/http-transport.ts:129-143`.

HttpClient returns non-success HTTP responses through the Observable error channel.
The adapter lets that rejection pass through instead of implementing fetch's Response
semantics. An Observable error with status 503 became `ThriftConnectionError`, with
no top-level status, instead of `ThriftHttpError(503)`. Authentication and retry logic
cannot use the same error contract as the default fetch transport.

Required change: preserve HTTP status, headers, and response body for backend errors;
keep network errors distinguishable. Angular's error contract is documented at:
https://angular.dev/guide/http/making-requests#handling-request-failure

## P1: per-call headers do not override names case-insensitively

Source: `packages/tsthrift/src/transport/http-transport.ts:78-83` and header-provider merging.

Base `{ Authorization: "Bearer old" }` plus per-call
`{ authorization: "Bearer new" }` becomes `Bearer old, Bearer new` in Headers.
Object spreading is case-sensitive, while HTTP header names are not.
This breaks authentication token replacement and similarly affects Content-Type.

Required change: normalize names and apply explicit override order using Headers or
an equivalent case-insensitive merge, including merged header providers.

## P2: root model exports hide client namespaces

Source: `packages/cli/src/compiler/generate.ts:98-105`;
`packages/cli/src/compiler/emit-clients.ts:123-133`.

The client index exports a namespace named after the module, then the package root
explicitly exports the same name for models. The explicit export wins.
For a root module `example`, the package root's `example` contained `ExampleClient`
but no `createExampleClient`, whereas the client submodule contained the factory.
Included non-root modules may expose different namespace contents.

Required change: define an unambiguous public namespace/export contract and execute
imports from the actual package root, not only internal files.

## P2: valid input names overwrite generated files

Source: `packages/cli/src/compiler/generate.ts:79-82,124-127`.

- `index.thrift` emits `metadata/index.ts`, then the metadata loader overwrites it.
- `service index { void ping() }` emits `clients/example/index.ts`, then the service barrel overwrites it.

Generation reports success; TypeScript compilation fails in both reproduced cases.

Required change: allocate non-conflicting generated paths or reject collisions before
publishing output. Include generated helper identifiers in the collision analysis.

## P2: generated package lifecycle is incomplete

Source: `packages/cli/src/compiler/generate.ts:130-156`;
`packages/cli/src/compiler/publish-output.ts:45-48`.

A newly generated `--package` directory packs only `.tsthrift.json`, `generation.json`,
`package.json`, and `tsconfig.json`: its main/types targets do not exist and TypeScript
sources are excluded by the files list. No build or prepack script compiles them.
Manual `tsc -p` produces JS/declarations in place, after which regeneration fails with
`Output contains files not owned by tsthrift`. Combining `--package --no-models`
produces a tsconfig with no source inputs and still points main/types at absent files.

Required change: provide a coherent source/build/pack/regenerate workflow and distinct
metadata-only packaging, or explicitly restrict this flag to source scaffolding and
remove claims of a ready installable package. Test the installed generated tarball.

## P2: generation accepts schemas that runtime cannot initialize

Source: `packages/cli/src/compiler/validate-schema.ts:29-58`.

Each of these examples generated and compiled successfully, then failed initialization:

```thrift
struct Data { 1: i32 a = "invalid" }
service Example { Data echo(1: Data data) }
```

```thrift
service Example { oneway i32 ping() }
```

```thrift
struct Data { -1: i32 a i32 b -2: i32 c }
service Example { Data echo(1: Data data) }
```

Runtime errors were respectively `Invalid i32 default`, `Invalid oneway method`, and
`Invalid or duplicate metadata field ... (-2)`.

Required change: validate defaults, oneway/result constraints, and effective implicit
field IDs before replacing prior output. Keep compiler and runtime validation consistent.

## P2: header providers are outside timeout and cancellation handling

Source: `packages/tsthrift/src/transport/http-transport.ts:77-86`.

An asynchronous header provider taking 75 ms completed successfully under a 5 ms
transport timeout; total request time was approximately 77 ms. Controller creation,
abort handling, and the timer start only after the provider resolves. A stuck provider
also prevents an already-aborted call from rejecting promptly.

Required change: bound the asynchronous preparation phase or clearly expose a separate
contract; ensure caller cancellation can settle the operation during header resolution.

## P2: malformed hex can silently change binary data

Source: `packages/tsthrift/src/runtime/binary-converter.ts:24-33`.

`toBinary("1g", "hex")` returns `[1]` instead of rejecting. `parseInt` accepts a valid
prefix, so the NaN check does not validate both characters.

Required change: validate the entire hex input before decoding and test malformed pairs.

## Verification gaps and release metadata

- `packages/cli/tests/reference/load-client.mjs:12-18` manually reconstructs clients
  with the correct mode. The original integration tests compile factory files but never execute
  those factories. This masks the numeric-mode defect. The new independent conformance
  suite executes generated factories with explicit i64Mode to isolate wire behavior;
  default factory-mode acceptance remains blocked.
- Angular tests cover an Observable success path, not abort, timeout, or HTTP errors.
- Live browser, real Angular/form consumers, legacy Vality complete-message
  cross-decoding, and production server acceptance remain unverified.
- The repository has no checked-in CI workflow; package publication currently builds
  but does not itself enforce all release checks.
- Package tarballs have neither README nor license text. Manifests declare MIT;
  a license file and package-specific usage documentation should accompany publication.
- `docs/tasks.md:17` previously marked exact large-integer IDL constants complete, but
  `const i64 MAX = 9223372036854775807` is rejected as an unsafe numeric literal.
  The rejection is intentional and documented elsewhere; the checkbox has been corrected.
- `docs/tasks.md:92` previously marked installable generated packages complete despite the
  reproduced lifecycle gap. The checkbox has been corrected; implementation remains pending.
- Documentation and CLI help disagree about metadata output with `--no-clients`;
  the current implementation emits models only unless metadata flags are supplied.
- HTTP response buffering happens before BinaryReader's 16 MiB limit. The decoder
  limit does not bound network-body allocation. This was identified by inspection;
  no resource-exhaustion experiment was performed.

## Recommended release gates

1. Fix and regression-test the P1 defects; settle generated public value/export contracts.
2. Fix remaining generator, adapter, and packaging defects above.
3. Run tests through generated synchronous factories, asynchronous factories, service
   descriptors, package-root imports, and installed generated tarballs.
4. Verify supported Angular versions, a live browser, and at least one actual consumer;
   verify legacy wire interoperation for any compatibility claim.
5. Align documentation/task checkboxes with evidence, include package documentation
   and license text, choose release versions, and automate the validated release checks.

The current low-level binary/runtime test results are useful evidence. They do not
establish release readiness of the generator, Angular adapter, or generated package API.
