# Architecture

## Production direction

Reuse Apache Thrift 0.24 for generated JS structures, serializers, service clients,
and declared exceptions. Generate public TS models, real enums, and compatible
metadata in tsthrift. Add a public data conversion layer and a replaceable
Woody-compatible transport. See the [source audit](compatibility.md) for the
contracts and limitations behind this direction.

A production switch requires resolving Map compatibility. Updating the entire
Vality C++ fork and writing another full serializer are not prerequisites. A small
versioned compatibility transformation may be needed around stock JS output;
its scope must be proven with executable fixtures before adopting it.

```text
Thrift IDL
  |-- legacy parser / include graph --> metadata + public TS models/enums
  |-- Apache 0.24 js:node,es6,bigint --> internal generated JS
                                               |
                             public/internal data conversion
                                               |
                                  framework-neutral Promise API
                                               |
                              Woody-compatible request transport
                                               |
                 +-----------------------------+-------------------+
                 |                             |                   |
           direct consumers             React Query helpers    Angular services
```

The diagram describes the intended complete pipeline. Current code implements
metadata/models and the internal Apache output, not public clients or adapters.

## Compiler and data boundaries

Metadata uses the existing `{ path, name, ast }[]` representation. Preserve field
IDs, defaults, includes, typedefs, enums, and constant expressions without mutating
that AST for another backend. Metadata-only generation must work without Apache.
A single baseline artifact checks the consumer contract; do not duplicate the
third-party parser's own grammar test suite.

Public i64 defaults to bigint. Explicit `--i64 number` selects legacy numeric
models; Apache internal i64 remains bigint. A recursive boundary adapter must
cover arguments, results, exceptions, defaults, containers, and map keys.
The experimental scalar helpers reject unsafe numbers and out-of-range bigint.
Legacy decoding could return imprecise numbers; document any stricter behavior
before claiming runtime compatibility.

Public structs are plain objects. Public collections remain Map, Set, and arrays.
Apache instances and its set arrays are internal details. An optional `{}` stays
present; only null/undefined mean absent. Preserve false, zero, and empty strings.
Resolve binary string/Buffer/Uint8Array behavior against actual consumers before
shipping conversion. Unsafe IDL integer literals still require lossless parsing.

## Apache backend

`--target apache` requires exactly 0.24.0 and uses `js:node,es6,bigint`. ES6 clients
return native Promises without injecting an extra callback parameter, avoiding
the `callback` collision handled by the Vality fork patch. Generated modules are
still CommonJS and use symbol-based read/write methods, bigint bridge helpers,
recursion helpers, and UUID imports. Match runtime and compiler versions.

ES6 does not change maps into Map. Object indexing cannot preserve struct keys.
Before enabling all Damsel clients, evaluate a narrow AST transformation of map
allocation/read/write/constant expressions plus matching constructor copy helpers.
A runtime helper alone is insufficient because the generated JS itself indexes
object properties. Validate scalar and structured keys, nested maps, defaults,
constants, and special property names. Keep unsupported cases rejected until
this passes; do not silently convert keys to strings.

Preserve guards for conflicting JS filenames and unresolved transitive typedef
imports. Callback arguments are now permitted. General generated-name collisions
still require fixtures; resolving callback does not prove all names are safe.

## Transport and client contract

Reuse Apache Binary Protocol and buffered transport contracts when wiring its
clients. Replace HTTP I/O based on the responsibilities in woody_js, preserving
binary payloads, `application/x-thrift`, per-call headers, declared exceptions,
HTTP/network errors, timeout, and response correlation. Tracing/authentication
headers are provided above the old transport and must remain supported.

The core client must accept request-scoped cancellation and header overrides,
forwarding AbortSignal through the actual HTTP request. Per-call settings must
not change IDL argument order or become shared mutable state between requests.
Transport injection should support fetch and an Angular HttpClient adapter
without importing Angular into core code. Choose the concrete API while building
the first working request; do not create unused factories/interfaces now.

Preserve error identity and useful call context in compatibility wrappers. Test
cleanup of pending requests and timers on success, declared error, HTTP error,
timeout, cancellation, and decoding failure. Do not copy the old timer race or
connection internals without verifying their behavior.

## Framework output

Build framework adapters as optional entry points over the same Promise client,
models, and metadata. Framework output selection is independent of the current
`--target` compiler/output selection. Adapter flags and entry paths are not yet
implemented or finalized.

### React and TanStack Query

Generate typed query/mutation options rather than embedding React in the client.
Query functions forward the provided AbortSignal. Classify queries versus
mutations explicitly; Thrift IDL alone does not describe idempotence or safe
retry behavior. Keep retry/invalidation policy with the application.

Keys must include service/method, arguments, and the relevant endpoint/tenant
scope. Normalize bigint, Map, Set, and binary arguments into a deterministic,
JSON-serializable representation without losing types or conflating keys. Raw
Thrift arguments cannot simply be inserted into a default JSON-hashed query key.
SSR cache persistence/hydration needs the same explicit value handling.
See [query keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys)
and [cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation).

### Angular

Provide an optional service output/profile with Angular/RxJS peer dependencies.
The compatibility profile must preserve exported service names, the constructor
receiving `Observable<ConnectOptions>`, Observable methods, lazy `metadata$`,
namespace entry points, error exports, and per-call header creation. It should
build with `--i64 number` for existing consumers.

Support provider factories or injectable service wrappers around the Promise
core, with HttpClient usable as the HTTP adapter. Observable subscription and
unsubscription must have deliberate request/cancellation behavior; converting
an already-started Promise alone does not cancel its request. Verify configuration
updates and lazy loading against the existing service implementation. If output
contains Angular decorators, validate its Angular package compilation format.
See [Angular providers](https://angular.dev/guide/di/defining-dependency-providers).

## Existing experimental runtime

`tsthrift/runtime` currently exposes an independent low-level BinaryReader/Writer
and scalar i64 helpers. It is tested against Apache but not used by generated
clients and is not a drop-in Apache protocol object. Keep it isolated while the
Apache-backed path is evaluated. Do not extend it into a parallel codec generator
or remove it as part of unrelated compatibility changes.

## Source ownership

| Path                                                          | Responsibility                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------- |
| `src/compiler/load-schema.ts`                                 | Entry/include graph and legacy parser integration             |
| `src/compiler/resolve-type.ts`                                | Named type and typedef resolution                             |
| `src/compiler/validate-schema.ts`                             | Common validation without Apache restrictions                 |
| `src/metadata/`                                               | Legacy metadata schema and artifact emission                  |
| `src/compiler/emit-models.ts`                                 | Public model/enum/service-interface source                    |
| `src/compiler/emit-constant.ts` and adjacent constant modules | Constant values, references, defaults                         |
| `src/compiler/generate.ts`                                    | Target orchestration and manifest                             |
| `src/compiler/publish-output.ts`                              | Output ownership, staging, replacement, rollback              |
| `src/compiler/run-thrift.ts`                                  | Exact compiler version, shared flags, generated import checks |
| `src/compiler/validate-apache.ts`                             | Map and generated filename restrictions                       |
| `src/runtime/` and `src/runtime.ts`                           | Experimental independent binary runtime                       |
| `tests/reference/`                                            | Test-only Apache runtime processes                            |

## Validation

Test project-owned behavior: emitted artifacts and imports, conversion boundaries,
HTTP integration, metadata contracts, and framework adapters. Use real generated
JS for runtime compatibility tests; source inspection or a self-round-trip alone
is insufficient. Keep upstream grammar/protocol test duplication out of scope.

### Commands

```sh
vp check
vp test
vp run build
THRIFT_COMPILER=/path/to/thrift-0.24.0 vp test
```

External-compiler tests skip when `THRIFT_COMPILER` is not provided. Binary tests
use pinned Apache npm development dependencies. Generated Apache JS directly
imports `uuid`, which is configured as an explicit development dependency for tests.
Verify the compiler version rather than relying on a default system `PATH` binary.

The callback integration test compiles IDL, loads generated JS, performs binary
client/processor exchange, checks a declared exception, and verifies cleanup.
The metadata test is one legacy consumer-output comparison, not an upstream
parser test suite. Keep its producer provenance in the fixture README.

### Real-protocol validation

To validate against real-world schemas, set `THRIFT_COMPILER` and `DAMSEL_PROTO`
to the installed compiler and checked-out schema paths:

```sh
node dist/cli.mjs --input "$DAMSEL_PROTO" --output ./generated-damsel \
  --namespace domain_config_v2 --namespace domain --namespace payment_processing \
  --namespace accounter --namespace webhooker --namespace api_extensions \
  --namespace proxy_provider
node_modules/.bin/tsc --ignoreConfig --noEmit --strict --skipLibCheck \
  --target es2020 --module nodenext ./generated-damsel/models/*.ts
```

Repeat with `--i64 number`. Full Apache generation remains blocked by the map guard;
model generation alone is not client validation. Direct TS7 file checks require
`--ignoreConfig`. The pack build currently emits an upstream TS7 experimental API warning.

Production acceptance requires rebuilt protocol packages and actual consumers,
including forms, Observable services, React Query cancellation/cache keys, and
cross-decoding with the legacy Vality runtime. Existing wire tests and a callback
loopback are narrower evidence and do not satisfy that full acceptance criterion.
