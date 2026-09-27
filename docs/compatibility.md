# Compatibility audit

The release contract is defined by the existing generators, runtime, and consuming
packages. Public type similarity and Binary Protocol conformance alone do not
establish a drop-in replacement. This audit separates inspected implementation
contracts from behavior already verified by tsthrift tests.

## Source revisions

| Repository              | Inspected revision                         | Relevant code                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| thrift-ts               | `4a4a893f64ee62e0c4ba2570609b3f22b5e897a1` | [compile.ts](https://github.com/valitydev/thrift-ts/blob/4a4a893f64ee62e0c4ba2570609b3f22b5e897a1/src/compile.ts), [BaseCompiler.ts](https://github.com/valitydev/thrift-ts/blob/4a4a893f64ee62e0c4ba2570609b3f22b5e897a1/src/BaseCompiler.ts)                                                                                                                                                                                                      |
| frontend-thrift-codegen | `396d9f313fcad94b265f3c14dcd0cc2228437a0b` | [compile-proto.js](https://github.com/valitydev/frontend-thrift-codegen/blob/396d9f313fcad94b265f3c14dcd0cc2228437a0b/tools/compile-proto.js), [service template](https://github.com/valitydev/frontend-thrift-codegen/blob/396d9f313fcad94b265f3c14dcd0cc2228437a0b/tools/templates/__exportName__.ts), [client conversion](https://github.com/valitydev/frontend-thrift-codegen/tree/396d9f313fcad94b265f3c14dcd0cc2228437a0b/tools/static/utils) |
| woody_js                | `397aa83ca5f564373e37b66a9ae32bcbba33d1de` | [connection entry](https://github.com/valitydev/woody_js/blob/397aa83ca5f564373e37b66a9ae32bcbba33d1de/src/connect-client.js), [HTTP connection](https://github.com/valitydev/woody_js/blob/397aa83ca5f564373e37b66a9ae32bcbba33d1de/src/client/http_connection.js), [runtime helpers](https://github.com/valitydev/woody_js/blob/397aa83ca5f564373e37b66a9ae32bcbba33d1de/src/client/thrift.js)                                                    |
| Vality Thrift           | `af4dde28fa09a75c31c8ba609f4aee49641d8e8c` | [JS generator](https://github.com/valitydev/thrift/blob/af4dde28fa09a75c31c8ba609f4aee49641d8e8c/compiler/cpp/src/thrift/generate/t_js_generator.cc), [callback patch](https://github.com/valitydev/thrift/commit/955febe7db3b502f1596ee5db41e2d92a559072d)                                                                                                                                                                                         |
| control-center          | `c442d75a340d91f3eb830d2ac2e4d58f2babe569` | [service providers](https://github.com/valitydev/control-center/blob/c442d75a340d91f3eb830d2ac2e4d58f2babe569/src/utils/thrift/provide-thrift-services.ts), [request headers](https://github.com/valitydev/control-center/blob/c442d75a340d91f3eb830d2ac2e4d58f2babe569/src/utils/thrift/create-wachter-headers.ts)                                                                                                                                 |
| Apache Thrift           | compiler/runtime `0.24.0`                  | [JS generator](https://github.com/apache/thrift/blob/v0.24.0/compiler/cpp/src/thrift/generate/t_js_generator.cc), [browser runtime](https://github.com/apache/thrift/blob/v0.24.0/lib/nodejs/lib/thrift/browser.js)                                                                                                                                                                                                                                 |

The historical package-generation entry is defined in protocol package configurations.
The metadata fixture separately records its exact producer version:
`@vality/thrift-ts@2.5.1-2b658f2.0`. Do not confuse that fixture provenance with the
checkout revision used for this audit.

## Existing pipeline

frontend-thrift-codegen invokes `thrift -r -gen js:node`, generates numeric TS
models via thrift-ts, and emits metadata separately. It wraps generated classes
with argument/result conversion and a client connected through woody_js.
Its browser build aliases `thrift` to local compatibility helpers and injects
Buffer. Replacing the npm transport alone therefore does not replace all runtime
behavior embedded in generated protocol bundles.

thrift-ts emits metadata as `{ path, name, ast }[]`, exposes Map/Set models, and
uses number i64 in the current frontend build. The wrappers turn plain values
into generated instances and decode them back. The conversion and metadata path
are compatibility responsibilities owned by tsthrift, even when parsing is delegated.

## Contract inventory

| Surface          | Existing contract                       | Current tsthrift status                                                               |
| ---------------- | --------------------------------------- | ------------------------------------------------------------------------------------- |
| Metadata         | Paths/names and legacy AST              | Baseline preserved; actual form consumers pending                                     |
| i64              | Numeric frontend values                 | Native bigint default or explicit safe-number mode                                    |
| Collections      | Map, Set, arrays                        | Native codecs preserve composite keys directly                                        |
| Structs/unions   | Public plain objects                    | Native read/write uses plain objects without class conversion                         |
| Services         | Observable wrappers and ConnectOptions$ | Native Promise factories, Angular DI tokens, and RxJS adapters (`toObservableClient`) |
| Metadata loading | Cached metadata$                        | Modular metadata loading via loadMetadata (or monolithic metadata.json when enabled)  |
| Exports          | Namespace services, errors, logging     | Native module-scoped factories; no drop-in package claim                              |
| HTTP             | Binary body, endpoint, per-call headers | Shared HTTP adapter exercised by native generated clients                             |
| Errors           | Declared errors and transport failures  | Native plain declared values; application errors preserve numeric code                |
| Browser output   | Bundled helpers and Buffer              | Native browser bundle runs in isolated JS context without Node globals                |

Native number mode rejects unsafe i64 values on write and read. Legacy decoding
could return imprecise numbers; the stricter behavior is intentional and requires
consumer acceptance. Native binary is Uint8Array, whereas legacy model generation
declares string and the inspected Woody readBinary implementation returns Buffer.
No implicit string/Buffer migration is claimed.

## Callback collision

The Vality patch makes the generated callback parameter name distinct from IDL
argument names. It modifies the C++ JS generator; applying that patch to Apache
would produce a modified compiler.

The unmodified official compiler has another route: `js:node,es6,bigint` creates
Promise client methods with only IDL parameters. The callback-named argument is
then ordinary data. This does not require renaming source IDL, patching generated
JS, or changing metadata. ES6 output remains CommonJS.

The integration fixture exercises `callback`, `callback1`, and `_callback`, a
value above Number.MAX_SAFE_INTEGER, a successful Promise result, and a declared
exception through real generated client/processor serialization. It also verifies
pending callbacks are cleaned up. This establishes the specific workaround;
other generated identifier collisions need their own coverage.

## Native map serialization and Apache comparison backend

Stock Apache 0.24 emits object properties for maps. An executed stock ES6 decode
of two struct-keyed entries produced only `{"[object Object]":"second"}`. Typed
keys and the first value were lost. The Vality generator/helper runtime uses Map.

The native runtime uses `MetadataCodecs` that write Map entries directly and read them
back into Map with decoded keys. No generated Apache source rewriting, object-key
conversion, or C++ fork is required. Apache's independent Binary Protocol reads
native requests and writes native replies in integration tests containing two
struct keys and nested sets in both i64 modes.

The earlier C++-fork strategy is no longer required by the native path. The legacy
Apache backend and compiler wrappers have been removed. Both the official Apache runtime
and the Vality Thrift fork (`valitydev/thrift` v0.20.1) are kept as test-time references
to independently cross-verify wire decoding, encoding, and RPC client/processor execution.
Wire conformance is verified separately against two exact compiler/runtime pairs:

1. **Vality reference**: Vality compiler 0.20.1 (`valitydev/thrift` C++ fork) with Java `libthrift 0.20.0`
   and `javax.annotation-api:1.3.2`. The Vality compiler emits `*Srv` service class names and JSR-250 annotations.
2. **Apache reference**: Official Apache Thrift compiler 0.24.0 with Java `libthrift 0.24.0`
   (using `-gen java:generated_annotations=suppress`). Apache emits unqualified service class names.

The conformance runner dynamically loads both service naming schemes without modifying Damsel IDL.
Byte-for-byte serialization equality, processor argument decoding, and reply roundtrips pass
identically under both references. Native entrypoints have no runtime dependency on Apache or Buffer.

## Executed native artifacts

Native integration tests compile emitted sources and execute Promise clients,
transitive typedef imports, recursion/defaults, inherited services, duplicate
service names across modules, argument-name collisions, binary bytes, and
structured map keys. They cover declared exceptions, application exceptions,
missing results, malformed correlation/type, trailing bytes, real loopback HTTP,
concurrent calls, cancellation, and timeout.

Vite browser output is executed in an isolated JS context without Buffer or
process. This verifies bundling and execution without Node globals; live browser
and framework acceptance remain pending.

Damsel revision `8d6174bddedc6d9aefa407fdc1d54877b8686ff9` was verified in the conformance
suite against both Vality 0.20.1 and Apache 0.24.0 references. It was also generated from entries
`domain_config_v2`, `domain`, `payment_processing`, `accounter`, `webhooker`,
`api_extensions`, and `proxy_provider`. Both numeric modes compiled all 15 reachable
modules and instantiated all 14 clients. The runtime SystemAccountSet codec
round-tripped two CurrencyRef map keys. This does not establish compatibility with
a deployed Damsel server or the full legacy application API.

Native struct decoding validates explicit required fields and skips unknown
fields. Duplicate known fields, mismatched container element types, and multiple
known union alternatives are rejected. These checks are stricter than some legacy
paths. Declared exceptions are rejected as decoded public objects rather than
Apache class instances. Consumers relying on instanceof need adaptation.

## Runtime metadata verification

The runtime client accepts the same legacy metadata array directly. The native
wire/HTTP test scenarios also run from metadata-only output with no generated
models, codecs, or clients. Both i64 modes cover inherited methods, transitive
collection typedefs, structured Map keys, binary bytes, errors, and cancellation.
An isolated browser-targeted bundle executes with string code generation disabled.
All 14 Damsel services described above initialize directly from their 15 metadata
modules in both modes. Live consumers and production servers remain unverified.

Runtime metadata resolution preserves the defining module of collection typedefs
and resolves relative includes. Enum references are accepted in the legacy parser's
joined dotted representation as well as segmented reference arrays. Defaults are
interpreted without executing source text; unsafe i64 defaults are rejected.

## Woody responsibilities

woody_js wires a buffered Binary Protocol connection to generated clients. Its
HTTP layer handles binary requests/responses and dispatches decoded replies by
method and sequence ID. Its helper copyMap behavior is part of the Map delta,
not merely HTTP I/O.

Authentication and x-woody tracing/identity headers are supplied by surrounding
client/application code. Tracing IDs in `control-center` and `frontend-thrift-codegen`
are generated via `generateId()` (`tools/static/utils/generate-id.ts`), producing 64-bit
Flake IDs encoded in base64 using `base-x` (`ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/`).
`@vality/tsthrift` provides an identical `generateId` (and aliased `generateTraceId`, `FlakeId`, `bs64`)
implementation operating directly on `Uint8Array` without requiring Node.js `Buffer` or globals,
producing 100% byte-for-byte and string-for-string matching IDs across browser and Node runtimes.

The replacement transport must accept those headers per
call and preserve refresh behavior. Preserve error propagation and request
correlation, but test cancellation/timeout cleanup rather than duplicating the
old Promise.race timer behavior.

Native clients reuse the HTTP adapter but serialize with the independent binary
runtime. The official Apache runtime is used as an independent test reference. Any borrowed
Woody or Apache source must retain its license notices. Existing loopback HTTP
and isolated bundle tests do not replace actual application acceptance.

## Metadata test scope

The committed JSON baseline is an output-contract test, not a parser grammar
suite. It protects module selection, include paths, output wrapping, and the
shape loaded by existing form consumers. Keep one such comparison and CLI/output
checks; add parser cases only when they expose project-specific incompatibility.
Do not regenerate the baseline with tsthrift or add tests that merely mirror
thrift-parser internals.
