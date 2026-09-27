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
metadata/ (or metadata.json) -> runtime schema resolution -> cached codecs -> Promise methods
                                                                          -> Binary Protocol / HTTP
```

## Native client runtime

Native client execution operates dynamically via `createMetadataClient` directly from
metadata (`loadMetadata` or optional `metadata.json`) without an external Thrift compiler or static code generation for codecs/clients.
The Binary Protocol reader and writer provide the wire implementation. Static client/codec
code generation has been replaced with this metadata-driven runtime.

```text
Thrift IDL
  -> pinned parser / include graph
       -> modular metadata/ (loadMetadata per namespace) & optional metadata.json (--metadata-json)
       -> public TS models, enums, constants (emitted by default)
```

The CLI generates TypeScript models, modular metadata modules (`metadata/`) with a
`loadMetadata(namespace)` loader resolving full transitive include closures, and optional
monolithic `metadata.json` (when `--metadata-json` is provided). Native RPC clients are
constructed directly at runtime via `createMetadataClient` using either `loadMetadata` or `metadata.json`.

## Compiler responsibilities

- Schema loading selects entry files and reachable includes.
- Shared validation and constant evaluation preserve the metadata contract.
- Model emission selects bigint/number i64 and generates TypeScript models.
- Output publication stages files and preserves prior output on failure.

These are source artifacts, not an automatically published protocol package.
Compile them as ESM with standard TypeScript/JavaScript tooling; modular metadata
files are TypeScript modules and do not require JSON module import support.

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
binary string constants are UTF-8 encoded. Model generation retains the
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

`MetadataClientConfig` (and underlying `RpcClientConfig`) accepts endpoint, static/dynamic headers, timeout, fetch,
logging, and an optional byte `transport`. The default HTTP transport posts
`application/x-thrift`, merges per-call headers, rejects non-200 responses, and
aborts fetch on timeout or caller cancellation. Its current compatibility policy
also accepts octet-stream and missing response Content-Type. A supplied transport
owns its own I/O, cancellation, and timeout behavior.

## Runtime/package boundaries

The `@vality/tsthrift` package and `@vality/tsthrift/runtime` have no runtime imports of
Apache Thrift, Buffer, parser, Node, Angular, or RxJS. `createMetadataClient` loads metadata once
at initialization and reuses pure TypeScript codecs and binary protocol reader/writer.

The legacy Apache Thrift target and `@vality/tsthrift/apache` runtime have been removed.
The official Apache `thrift` package is retained solely in test devDependencies to independently
verify Binary Protocol wire compatibility.

The standalone `@vality/tsthrift-angular` package provides Angular DI integration
(`provideThriftConfig`, `provideThriftServices`, `provideThriftClient`, `getServiceToken`,
`createServiceToken`), HttpClient-to-fetch adapter (`createHttpClientFetch`), and RxJS helpers
(`toObservableClient`, `deferThriftCall`) for Observable-based consumers. The CLI generates
pure framework-agnostic client modules and service registry descriptors (`services.ts`).

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

Run `vp install`, `vp check`, `vp run build`, then `vp test`. No external Thrift
compiler is required; tests execute directly against the native runtime and wire
verifiers. Native HTTP tests require permission to bind loopback sockets. See
[compatibility](compatibility.md) and [tasks](tasks.md) for remaining release work.

Metadata-only integration runs use a directory containing no generated model,
codec, or client modules. The same Apache request/reply checks, loopback HTTP,
and browser bundle execution run in both i64 modes. The browser JS context disables
string code generation. All 14 Damsel clients at the revision above also initialize
from the 15-module metadata array alone in both numeric modes.
