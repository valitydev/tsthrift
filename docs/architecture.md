# Architecture

## Production direction

Reuse Apache Thrift 0.24 for generated JS structures, serializers, service clients,
and declared exceptions. Generate public TS models, real enums, and compatible
metadata in tsthrift. Add a public data conversion layer and a replaceable
Woody-compatible transport. See the [source audit](compatibility.md) for the
contracts and limitations behind this direction.

A production switch requires resolving Map compatibility. The compiler strategy
relies on the updated Vality Thrift C++ fork (rebased on Apache 0.24), which
directly emits native JavaScript `Map` collections in `js:node,es6,bigint` mode.
This eliminates the need for AST rewriting or fragile Map conversion in tsthrift.
The runtime npm package remains official stock `thrift@0.24.0`, as Thrift Binary
Protocol byte serialization is naturally agnostic to whether the JS container is
a Map or an Object.

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

Stock Apache 0.24 does not emit Map, which loses non-string keys upon object property
coercion. Rather than maintaining complex AST transformations or post-generation
rewrites in tsthrift, the updated Vality Thrift compiler fork directly generates
native `Map` instances in its JS output.

The public data conversion layer in tsthrift therefore focuses exclusively on its
core responsibilities: converting plain typed JSON objects to and from Thrift
class instances, validating safe i64 numeric bounds when requested, and handling
declared exceptions.

Preserve guards for conflicting JS filenames and unresolved transitive typedef
imports. Callback arguments are now permitted. General generated-name collisions
still require fixtures; resolving callback does not prove all names are safe.

## Transport and client contract

Reuse Apache Binary Protocol and buffered transport contracts when wiring its
clients. Replace HTTP I/O based on the responsibilities in woody_js, preserving
binary payloads, `application/x-thrift`, per-call headers, declared exceptions,
HTTP/network errors, timeout, and response correlation.

Client configuration is declarative rather than tied to woody_js internal global state:

```ts
export interface ThriftClientConfig {
  /** Target service endpoint URL */
  endpoint: string;
  /** Static headers or dynamic provider invoked per request (e.g. auth, tracing) */
  headers?:
    Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);
  /** Default request timeout in milliseconds (defaults to 60_000) */
  timeoutMs?: number;
  /** Custom fetch or transport adapter (e.g. Angular HttpClient) */
  fetch?: typeof fetch;
}

export interface RequestOptions {
  /** Request cancellation signal */
  signal?: AbortSignal;
  /** Per-call header overrides */
  headers?: Record<string, string>;
  /** Per-call timeout override in milliseconds */
  timeoutMs?: number;
}
```

The core client accepts request-scoped cancellation, timeout, and header overrides:
`client.method(args, options?: RequestOptions)`, forwarding `AbortSignal` through
the HTTP request. Per-call settings do not change IDL argument order or become
shared mutable state between requests. Transport injection supports `fetch` and
an Angular `HttpClient` adapter without importing Angular into core code.

### Robust error handling and timeout guarantees

To eliminate the unresolved pending-promise leaks and hanging requests observed
in legacy clients during server errors (e.g. HTTP 500/502/504 returning HTML or
holding sockets open):

- **Strict HTTP status check**: Non-200 responses (e.g. 4xx/5xx) must never be
  passed to the Thrift binary decoder. They must immediately reject with a structured
  `ThriftHttpError(status, statusText, body)`.
- **Content-Type validation**: The response `Content-Type` must match
  `application/x-thrift`. HTML or malformed error pages are rejected immediately
  as protocol errors rather than stalling inside binary parser loops.
- **Enforced socket cancellation on timeout**: Timeouts are enforced using
  `AbortSignal.timeout` composed with any user-provided signal (`AbortSignal.any`).
  On expiration, the underlying fetch/socket connection is actively aborted by
  the runtime, and the call rejects with `ThriftTimeoutError`. Detached `Promise.race`
  patterns that leak background sockets are prohibited.
- **Resource cleanup**: Timers, in-flight callbacks, and buffers must be cleaned
  up deterministically on success, declared error, HTTP error, timeout, and
  external abort.

## Framework output

The immediate target framework is **Angular**. React and TanStack Query adapters
are deferred.

Metadata emission remains a static, build-time JSON artifact (`metadata.json`).
Loading metadata uses direct JSON import or a plain Promise function (`getMetadata()`),
eliminating the legacy runtime requirement for `Observable<metadata$>`.

### Angular integration

Angular services are generated over the Promise core and leverage modern Angular
dependency injection rather than the legacy `Observable<ConnectOptions>` constructor pattern:

- Service configuration is supplied via `InjectionToken` and provider factories
  (e.g., `provideThriftClient(Service, config)`).
- Service methods expose native Promise return types (aligning with Angular signals,
  `resource()`, and `rxResource()`), with straightforward `defer()` wrappers for
  RxJS-centric callers.
- Per-call options allow overriding tracing headers and passing `AbortSignal`.
- Avoid bundling RxJS or Angular decorators into the core compiler or runtime; keep
  the Angular profile in an optional adapter layer.
- Preserve exported service names, namespace entry points, and error classes.

### React and TanStack Query (deferred)

TanStack Query integration remains planned for a later phase following Angular
adoption. Key design criteria remain: typed query/mutation options, deterministic
query key normalization (for `bigint`, `Map`, `Set`), and `AbortSignal` forwarding.

## Existing experimental runtime

`tsthrift/runtime` currently exposes an independent low-level BinaryReader/Writer
and scalar i64 helpers. It is tested against Apache but not used by generated
clients and is not a drop-in Apache protocol object. Keep it isolated while the
Apache-backed path is evaluated. Do not extend it into a parallel codec generator
or remove it as part of unrelated compatibility changes.

## Source ownership

| Path                                                                       | Responsibility                                                |
| -------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `packages/cli/src/compiler/load-schema.ts`                                 | Entry/include graph and legacy parser integration             |
| `packages/cli/src/compiler/resolve-type.ts`                                | Named type and typedef resolution                             |
| `packages/cli/src/compiler/validate-schema.ts`                             | Common validation without Apache restrictions                 |
| `packages/cli/src/metadata/`                                               | Legacy metadata schema and artifact emission                  |
| `packages/cli/src/compiler/emit-models.ts`                                 | Public model/enum/service-interface source                    |
| `packages/cli/src/compiler/emit-constant.ts` and adjacent constant modules | Constant values, references, defaults                         |
| `packages/cli/src/compiler/generate.ts`                                    | Target orchestration and manifest                             |
| `packages/cli/src/compiler/publish-output.ts`                              | Output ownership, staging, replacement, rollback              |
| `packages/cli/src/compiler/run-thrift.ts`                                  | Exact compiler version, shared flags, generated import checks |
| `packages/cli/src/compiler/validate-apache.ts`                             | Map and generated filename restrictions                       |
| `packages/tsthrift/src/transport/`                                         | HTTP transport and declarative client runtime                 |
| `packages/tsthrift/src/runtime/`                                           | Experimental independent binary runtime                       |
| `packages/*/tests/reference/`                                              | Test-only Apache runtime processes                            |

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

To validate against real-world schemas, set `THRIFT_COMPILER` and `REFERENCE_PROTO`
to the installed compiler and checked-out schema paths:

```sh
node dist/cli.mjs --input "$REFERENCE_PROTO" --output ./generated-reference \
  --namespace identity --namespace catalog --namespace analytics \
  --namespace core --namespace events --namespace extensions
node_modules/.bin/tsc --ignoreConfig --noEmit --strict --skipLibCheck \
  --target es2020 --module nodenext ./generated-reference/models/*.ts
```

Repeat with `--i64 number`. Full Apache generation remains blocked by the map guard;
model generation alone is not client validation. Direct TS7 file checks require
`--ignoreConfig`. The pack build currently emits an upstream TS7 experimental API warning.

Production acceptance requires rebuilt protocol packages and actual consumers,
including forms, Observable services, React Query cancellation/cache keys, and
cross-decoding with the legacy Vality runtime. Existing wire tests and a callback
loopback are narrower evidence and do not satisfy that full acceptance criterion.
