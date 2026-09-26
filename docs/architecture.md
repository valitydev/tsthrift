# Architecture and compatibility

Status: initial generation pipeline implemented; runtime and package integration pending.

## Goal

Consolidate the frontend Thrift toolchain around one CLI and a framework-independent
runtime. Generate public TypeScript models, executable JavaScript clients, and
`metadata.json` from the same IDL inputs and include roots.

Start JavaScript generation with the official Apache Thrift 0.24 compiler.
Later, port the 0.24 JS generator and its necessary dependencies into
`valitydev/thrift` and switch after compatibility validation. The fork update is
not a prerequisite for implementing TS generation, metadata, runtime, or CLI.
Do not perform a full upstream merge or describe the entire fork as Thrift 0.24.

## Existing components

| Component                           | Current responsibility                              | Intended ownership                        |
| ----------------------------------- | --------------------------------------------------- | ----------------------------------------- |
| `valitydev/thrift-ts`               | Public TS models, client signatures, metadata AST   | `tsthrift` generation                     |
| Apache Thrift / `valitydev/thrift`  | Executable JS clients and structure serialization   | Official 0.24 first, updated fork later   |
| `valitydev/woody_js`                | Binary protocol and HTTP connection                 | Compatible `tsthrift` runtime             |
| `valitydev/frontend-thrift-codegen` | Orchestration, conversions, RxJS wrappers, bundling | `tsthrift` CLI and public client boundary |
| Consumer applications               | Angular DI and metadata-driven forms                | Remain consumer responsibilities          |

## Generation and runtime flow

```text
IDL files + include roots + selected namespaces
                       |
                  tsthrift CLI
                       |
          +------------+----------------+
          |                             |
 TS / metadata generation     Official Thrift 0.24 JS
          |                     (updated fork later)
          |                             |
 public models + metadata       internal JS clients
          |                             |
          +------- package build -------+
                       |
            public Promise-based client
                       |
             schema-aware conversion
                       |
               internal JS client
                       |
           Binary Protocol + HTTP runtime
                       |
                  Woody server
```

TS models and metadata should share a resolved schema model. The C++ JS backend
remains a separate generator; integration tests must verify agreement between its
output and that model. A single parser shared with C++ is not an initial requirement.

The initial pipeline uses `thrift-parser@0.4.2`, matching the previous metadata
producer. It resolves reachable includes and typedefs, emits models from the same
AST as metadata, and invokes the official compiler for JS. Public client interfaces
are generated, but their runtime implementation is a later phase.

Keep generation, metadata contracts, runtime, and CLI orchestration as separate
responsibilities within this repository. Introduce modules as they are implemented;
do not scaffold a plugin framework or split into multiple packages in advance.
Compiler dependencies must not enter browser runtime bundles.

## Framework-independent output

Generate ordinary JS/TS packages with typed Promise-based methods. Do not generate
Angular services, decorators, providers, RxJS wrappers, or Angular package builds.
Angular and RxJS must not be required by the generated client or runtime.

Applications own DI, reactive adaptation, and form rendering. This deliberately
changes the previous Observable service API: existing consumers need to adapt their
service integration. It does not authorize a simultaneous redesign of data models
or metadata. Final factory names and package export paths remain implementation
decisions, informed by existing consumer imports.

Export `metadata.json` separately so form consumers can load it without making all
RPC calls load form metadata. The old `metadata$` convenience export moves to the
consumer integration layer. Loading runtime conversion descriptors must not require
Angular, RxJS, or the full form metadata artifact.

## Compatibility contract

- Preserve the Thrift Binary Protocol wire format and server-facing HTTP behavior.
- Preserve the existing metadata array shape (`path`, `name`, `ast`), references,
  field IDs, optionality, typedef information, and namespace interpretation.
- Preserve public model names and representations, including `Map`, `Set`, and
  object-shaped structs and unions, except for separately documented migrations.
- Preserve empty-but-present optional structs: `{}` is present; `null` and
  `undefined` represent absence at the public conversion boundary.
- Keep public `i64` values as `number`; use `bigint` in generated JS internally.
- Retain endpoint configuration, per-call headers, tracing/authentication header
  forwarding, and timeout behavior needed by existing consumers.
- Inventory observable error behavior and generated imports before replacing them.
  Record any necessary migration instead of claiming complete API compatibility.

The current `binary` declaration is `string`, while the old Binary Protocol can
return `Buffer`. Capture actual consumer usage and old output before selecting a
consistent representation; a public switch to `Uint8Array` is not yet agreed.

## i64 boundary

Convert `number` to `bigint` before invoking generated clients and convert results
back to `number`. Apply conversion recursively through typedefs, structures,
unions, collections, map keys, arguments, results, and declared exceptions.

Proposed numeric safety policy: reject non-integer or unsafe input numbers and
reject response integers outside the safe number range. Never silently round an
`i64`. The old response conversion could lose precision; strict rejection is a
behavior change to record and verify before migration, not an existing guarantee.

Metadata continues to describe the IDL type as `i64`. Internal `bigint` values must
not leak into JSON metadata. Define an exact JSON encoding for large IDL constants
if the existing metadata representation cannot preserve them.

## Initial compiler and later fork update

Use a pinned official Apache Thrift 0.24 compiler with `--gen js:node,bigint`
for the first implementation. Allow selecting the compiler executable through the
CLI and record its version in build diagnostics. Do not require fork-only options
such as `runtime_package` in the initial path; resolve the generated `thrift`
import to the compatible runtime during package building.

Official output is not identical to the Vality fork: maps use objects rather than
`Map`, and fork-specific callback collision fixes are absent. Validate actual IDL
against these differences. Keep public collection representations stable through
schema-aware conversion where lossless conversion is possible. Detect unsupported
map key types or name collisions and report them explicitly; never silently coerce
distinct keys into the same object property. Record any affected protocol as blocked
until the generator can represent it correctly.

The later switch to the updated fork must pass the same public API, metadata, and
wire compatibility tests. Update internal conversions for the fork's Map output
without exposing that compiler change to consumers. Supporting arbitrary compiler
versions or maintaining a general backend plugin system is outside the scope.

Start from a pinned Apache Thrift 0.24 source revision and preserve the fork's
required changes, notably `Map` generation, `runtime_package`, and callback-name
collision handling. Bring across necessary compiler dependencies selectively.
Retain license and attribution notices when reusing upstream code.

A real-compiler integration test with `--gen js:node,bigint` produces calls to
`thrift.toBigInt(input.readI64())` and `output.writeI64(thrift.fromBigInt(value))`.
It also checks generated JS syntax, type-checks public TS models, and verifies
metadata and regeneration. It does not verify RPC execution or a completed fork port.

Upstream output also expects symbol-based structure read/write methods and
protocol recursion-depth helpers. Its bigint mode still bridges through `Int64`;
native bigint generation alone does not remove `node-int64` from the runtime.
Audit these contracts, UUID imports, and client lifecycle requirements together.

Removing the `Int64` bridge is not required for the first compatible implementation.
Replacing `woody_js` still requires compatible serialization and Woody headers;
the library name and the server protocol are separate concerns.

## Validation and rollout

Using the official compiler, first complete one small IDL fixture end to end: generation, package build,
request encoding, HTTP exchange, response decoding, and public value conversion.
Cross-check new encoded messages with the old decoder and old messages with the
new decoder. Cover integer boundaries, containers, exceptions, and unknown fields.

Then generate Damsel using the namespace selection from its existing build:

```sh
thrift-codegen --i ./proto --n domain_config_v2 domain payment_processing accounter webhooker api_extensions proxy_provider
```

This is the existing command, not an implemented `tsthrift` CLI invocation.
Preserve its input/include/namespace selection capabilities in the replacement.
Validate external includes and transitive typedefs on real protocol packages.
The first full Damsel attempt is blocked by its struct-keyed map
`accounter.InvalidPostingParams.wrong_postings`. The official object-backed map
representation cannot preserve those keys. The standalone `base` module generates;
this does not establish full Damsel compatibility.
Regenerate affected packages before migrating application integration; replacing
an application import cannot remove a runtime embedded in old generated bundles.

## References

- [Vality thrift-ts](https://github.com/valitydev/thrift-ts)
- [Vality Thrift fork](https://github.com/valitydev/thrift)
- [Woody JS](https://github.com/valitydev/woody_js)
- [Existing frontend CLI](https://github.com/valitydev/frontend-thrift-codegen)
- [Damsel build reference](https://github.com/valitydev/damsel/blob/8d6174bddedc6d9aefa407fdc1d54877b8686ff9/package.json)
- [Apache Thrift 0.24 JS generator](https://github.com/apache/thrift/blob/v0.24.0/compiler/cpp/src/thrift/generate/t_js_generator.cc)
