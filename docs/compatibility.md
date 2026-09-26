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

The historical package-generation entry is [Damsel package.json](https://github.com/valitydev/damsel/blob/8d6174bddedc6d9aefa407fdc1d54877b8686ff9/package.json).
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

| Surface          | Existing contract                                                              | Current tsthrift status                                             |
| ---------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Metadata         | Paths/names plus legacy AST, independently loadable                            | Artifact fixture passes; live forms pending                         |
| i64              | Existing frontend models use number                                            | Explicit number mode; bigint default is a different public contract |
| Collections      | Public Map, Set, arrays; generated map helpers use Map                         | Models supported; stock Apache object maps need adaptation          |
| Structs/unions   | Plain public values converted to generated instances                           | Models/constants supported; client boundary conversion pending      |
| Services         | Async factory plus Observable service wrapper constructed with ConnectOptions$ | Promise interfaces only; public clients/wrappers pending            |
| Metadata loading | Lazy cached metadata$ export                                                   | JSON emitted; Observable compatibility export pending               |
| Exports          | Namespace entries, service classes, errors, logging and ID helpers             | Generated package/export compatibility pending                      |
| HTTP             | Binary body, application/x-thrift, endpoint and per-call headers               | No production transport yet                                         |
| Errors           | Declared error, missing service, timeout, call context                         | Low-level checks and Apache loopback only                           |
| Browser output   | Bundled runtime helpers and polyfills                                          | Package/browser integration pending                                 |

Unsafe legacy i64 decoding can warn and return an imprecise number. The current
experimental number conversion rejects unsafe values. That is a behavior change
to document explicitly, not evidence of complete runtime compatibility.

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

## Map resolution via updated compiler fork

Stock Apache 0.24 emits `{}`, property indexing, and object-key iteration
for maps in both node and node+es6 modes. The Vality generator and its helper
runtime use Map. For simple keys a boundary conversion may be possible, but
structured keys cannot be recovered after object-property coercion.

An executed stock-ES6 decode of two struct-keyed map entries yielded only
`{"[object Object]":"second"}`. The first entry and both typed keys were lost.
Damsel contains this case in `accounter.InvalidPostingParams.wrong_postings`.

Rather than attempting complex AST transformations or post-generation text rewriting
inside tsthrift, the project resolves this by updating the Vality Thrift C++ compiler
fork (rebased onto Apache 0.24) to emit native `Map` collections directly in
`js:node,es6,bigint` mode.

The runtime npm package remains official stock `thrift@0.24.0`: Thrift's `TBinaryProtocol`
and `TBufferedTransport` operate on wire tokens (`writeMapBegin`/`readMapBegin`) and
do not depend on whether JavaScript represents the map as an object or a `Map`.

## Woody responsibilities

woody_js wires a buffered Binary Protocol connection to generated clients. Its
HTTP layer handles binary requests/responses and dispatches decoded replies by
method and sequence ID. Its helper copyMap behavior is part of the Map delta,
not merely HTTP I/O.

Authentication and x-woody tracing/identity headers are supplied by surrounding
client/application code. The replacement transport must accept those headers per
call and preserve refresh behavior. Preserve error propagation and request
correlation, but test cancellation/timeout cleanup rather than duplicating the
old Promise.race timer behavior.

Reuse compatible Apache runtime modules for serialization. Any borrowed Woody
or Apache source must retain the required license notices. The first transport
implementation needs actual browser bundling and HTTP tests; the callback loopback
and binary reader tests do not establish those properties.

## Metadata test scope

The committed JSON baseline is an output-contract test, not a parser grammar
suite. It protects module selection, include paths, output wrapping, and the
shape loaded by existing form consumers. Keep one such comparison and CLI/output
checks; add parser cases only when they expose project-specific incompatibility.
Do not regenerate the baseline with tsthrift or add tests that merely mirror
thrift-parser internals.
