# Architecture

## Runtime metadata clients

`createMetadataClient` constructs a Promise client from a legacy Metadata[] schema,
namespace, service name, and transport configuration. It accepts a static array,
Promise, or lazy loader. Initialization snapshots metadata and resolves reachable
service/type definitions once into in-memory codecs. Calls then reuse the common
native Binary Protocol and request implementation. No generated source modules,
parser, external compiler, or runtime code generation are required.

The shared MetadataIndex retains a collection typedef's defining namespace and
resolves relative include paths. MetadataCodecs handles recursive references and
field IDs. Default evaluation interprets parser expressions as values, resolving
constant/enum references without eval; collection defaults are cloned per value.
Duplicate modules, invalid fields, unknown types/services, and inheritance cycles
fail during initialization before transport execution. The factory requires an
explicit namespace, so same-named services cannot select the wrong module.

Clients keep an immutable schema snapshot. A new schema requires a new client.
Types/default expansion is bounded, and wire limits match the generated backend.
The default public type is a dynamic method map returning Promise<unknown>; callers
may provide a matching existing TS client type. The asynchronous factory rejects
an IDL method named `then`, which would otherwise trigger Promise assimilation.

```text
metadata.json -> runtime schema resolution -> cached codecs -> Promise methods
                                                         -> Binary Protocol / HTTP
```

## Native client pipeline

`--target native` generates executable TypeScript clients and codecs without an
external Thrift compiler or Apache runtime. The existing Binary Protocol reader
and writer are the wire implementation. The legacy parser remains pinned for
metadata compatibility; replacing its grammar is outside this backend change.

```text
Thrift IDL
  -> pinned parser / include graph
       -> unchanged metadata.json (runtime clients and forms)
       -> public TS models, enums, constants
       -> executable type and service codecs
            -> namespace-scoped Promise client factories
                 -> Uint8Array Binary Protocol
                      -> fetch / framework HTTP adapter / byte transport
```

The CLI defaults to `models` to preserve metadata/model-only workflows. Select
`native` explicitly to generate clients. The optional `apache` target remains a
comparison and migration backend; native generation does not call it.

## Compiler responsibilities

- Schema loading selects entry files and reachable includes.
- Shared validation and constant evaluation preserve the metadata contract.
- Model emission selects bigint/number i64 and the backend's binary type.
- Native codec emission resolves typedefs before choosing imports. References to
  types in transitive includes import their actual defining module.
- Lazy struct field definitions support recursive and forward type references.
- Client emission groups services by IDL filename, so identical service names in
  different modules do not overwrite files or exports.
- Output publication stages files and preserves prior output on failure.

Native output contains `models/<module>.ts`, `codecs/<module>.ts`, and
`clients/<module>/<Service>.ts`. The root exports model namespaces plus `clients`.
The client index exposes module namespaces, `SERVICES`, and `SERVICES_LIST`.
Registry keys are `module.Service`; descriptor `serviceName` retains the IDL name.

These are source artifacts, not an automatically published protocol package.
Compile them as ESM with JSON module support, or use a TypeScript-aware bundler.

## Native value and wire contracts

Public structs, unions, and declared exceptions are plain objects. Codecs read
and write these values directly without Apache constructors or an AST lookup at
request time. Maps retain typed keys, including structs; sets use Set and lists
use arrays. Explicit `{}` remains present, and false/zero/empty strings survive.

`--i64 bigint` preserves the signed 64-bit range. `--i64 number` rejects unsafe
integers on write and read, including nested values and map keys. The mode is
fixed in generated codecs or selected once using MetadataClientConfig.i64Mode.
The legacy parser still rejects unsafe integral IDL literals because metadata
cannot preserve them exactly.

Native `binary` is Uint8Array, including constants and nested defaults. IDL
binary string constants are UTF-8 encoded. The models/apache targets retain the
legacy string declaration. This explicit native contract requires consumer
migration where applications currently expect strings or Buffer APIs.

Declared defaults are constructed per value. Only explicitly required fields
are checked as required on the wire. Unknown fields and incompatible field wire
types are skipped; absent required fields, duplicate known fields, invalid
container element types, and multiple known union fields are rejected. Empty
unions remain representable for schema evolution. Implicit field IDs descend
from -1; explicit nonpositive IDs are preserved (the Apache equivalent requires
its negative-field-key option).

Known-value recursion is bounded to 64 levels. Low-level reader byte, collection,
and skip limits remain active. See [runtime](runtime.md).

## Requests, responses, and errors

Every call owns its writer, response reader, sequence ID, and RequestOptions.
Options are selected by the IDL argument count, not by inspecting object keys.
Arguments named `options`, `callback`, or `params` remain ordinary payload data.
Inherited service methods share the same client connection configuration.

Replies must match method and sequence ID, use REPLY or EXCEPTION, and contain
no trailing bytes. Non-void replies require a success field or declared exception.
Declared exceptions reject with decoded plain objects. Application exceptions
use `ThriftApplicationError` with the server's numeric code. Oneway methods send
ONEWAY and resolve after the transport completes without decoding a reply.

`NativeClientConfig` accepts endpoint, static/dynamic headers, timeout, fetch,
logging, and an optional byte `transport`. The default HTTP transport posts
`application/x-thrift`, merges per-call headers, rejects non-200 responses, and
aborts fetch on timeout or caller cancellation. Its current compatibility policy
also accepts octet-stream and missing response Content-Type. A supplied transport
owns its own I/O, cancellation, and timeout behavior.

## Runtime/package boundaries

`@vality/tsthrift/native` has no runtime imports of Apache Thrift, Buffer, parser,
Node, Angular, or RxJS. Generated RPC calls do not load metadata; metadata clients load it once at initialization. Registry metadata
loaders use a separate JSON dynamic import only when invoked.

Apache `thrift@0.24.0` and `buffer` are optional peer dependencies, installed as
development dependencies for comparison tests. Users of the legacy root client
entry and `--target apache` must install them. This backend still requires the
matching external compiler and retains its stock object-map limitation.

The Angular entry can consume generated service descriptors using the existing
DI providers and fetch adapter. Decorated Angular service generation, legacy
Observable APIs, and application/form acceptance remain separate work. React
and TanStack Query output is deferred.

## Verification and acceptance

Native integration tests compile emitted TS in bigint and number modes and
execute it in a separate Node process. Apache Binary Protocol independently
reads requests and writes replies, including composite map keys, binary values,
declared/application errors, and response correlation failures. Tests exercise
real local HTTP, concurrent calls, headers, cancellation, timeout, and HTTP errors.
A browser-targeted Vite bundle is executed in an isolated JS context without
Buffer or process; this is not a live-browser acceptance test.

The 15 reachable Damsel modules at revision
`8d6174bddedc6d9aefa407fdc1d54877b8686ff9` were generated and compiled in both
modes; all 14 client descriptors instantiated and SystemAccountSet maps with two
CurrencyRef keys round-tripped. This establishes generated-artifact behavior,
not production server, Angular application, or dynamic-form acceptance.

Run `vp install`, `vp check`, `vp run build`, then `vp test`. Set
`THRIFT_COMPILER` to Apache 0.24.0 to enable the older external-compiler tests.
Native tests require no compiler; HTTP tests require permission to bind loopback
sockets. See [compatibility](compatibility.md) and [tasks](tasks.md) for remaining
release work.

Metadata-only integration runs use a directory containing no generated model,
codec, or client modules. The same Apache request/reply checks, loopback HTTP,
and browser bundle execution run in both i64 modes. The browser JS context disables
string code generation. All 14 Damsel clients at the revision above also initialize
from the 15-module metadata array alone in both numeric modes.
