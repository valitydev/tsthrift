# Architecture and compatibility

Status: standalone metadata and public model generation implemented; native
serialization, RPC runtime, and package building are the next stages.

## Goal and ownership

First port the existing metadata generator into tsthrift and preserve its form
consumer contract. Then implement a native JS/TS Thrift code generator using the
same resolved schema. Generated packages remain ordinary framework-independent
libraries. Angular providers, RxJS adaptation, and form rendering belong to consumers.

Apache Thrift 0.24 is an optional reference generator for differential tests and
wire compatibility. The native generator will replace external compiler execution
in the production path. A C++ fork update is not required for this plan.

## Current pipeline

```text
IDL files + include roots + selected namespaces
                       |
              parser + schema resolution
                       |
             common schema validation
                       |
          +------------+----------------+
          |                             |
 legacy metadata.json             public TS models
          |                       + runtime enums
 metadata target                        |
          +---------- models target ----+
                       |
            optional Apache validation
                       |
          official 0.24 internal JS output
                  (apache target)
```

`thrift-parser@0.4.2` matches the old metadata producer. The loader visits selected
entry files and reachable includes, preserving source paths relative to their input
roots. It does not scan unrelated dependency fixtures.

Metadata is emitted directly from the parsed AST. Models use the same resolved
program graph. Metadata-only generation does not call the model emitter, so its
constant-emission limitations cannot block metadata output.

Model constant generation resolves local and included references, enum members,
structured values, defaults, and nested collections. Referenced values are expanded
at generation time, avoiding runtime initialization-order dependencies. Field types
are resolved in their declaration scope, while references inside a literal use the
literal's source scope. Cycles, invalid scalar values, unknown or missing fields,
and invalid union values fail before output replacement. Metadata keeps the original
constant expressions unchanged.

Keep common IDL validation separate from Apache JS restrictions. Struct-keyed maps
and an argument named `callback` are valid for metadata and public models even when
the reference compiler cannot generate usable JS for them.

Generation, metadata contracts, output publication, and compiler invocation have
separate modules. Do not introduce a backend plugin framework or split the project
into multiple packages before a concrete need exists.

## Metadata contract

Preserve the existing `{ path, name, ast }[]` representation, including namespaces,
include paths, field IDs, optionality, defaults, typedef chains, enums, unions,
exceptions, and services. The AST preserves omitted enum values; resolving their
numeric values for code generation must not mutate metadata.

Metadata remains independent of Angular and RxJS. Export it separately from RPC
code so forms can load it without requiring the transport. The old `metadata$`
convenience wrapper belongs in consumer integration.

A committed fixture records the JSON output of
`@vality/thrift-ts@2.5.1-2b658f2.0`. The same comparison was performed on all 15
reachable Damsel modules selected by its existing command; parsed metadata matched.
This does not yet validate every legacy parser construct or consumer behavior.

Unsafe integral numeric literals are rejected because the legacy parser uses JS
numbers. Exact representation of large IDL constants remains an explicit follow-up.

## Public models and enums

Public structs, unions, and exceptions use object-shaped TS types; collections use
`Map`, `Set`, and arrays. Struct-keyed maps retain `Map<Struct, Value>` types. Use
array syntax and qualified built-in collection types to avoid collisions with IDL
names such as Damsel's `Array` typedef.

Emit ordinary `export enum`, not type aliases, string unions, ambient declarations,
or `const enum`. Explicit values, implicit increments, negative values, and aliases
must survive compilation. Runtime tests verify forward and reverse mappings and
that declaration files retain the enum API. Enum values must fit signed i32.

Public `i64` is selected with `--i64 number|bigint` (API: `i64`), defaulting to
`bigint`. Existing number-based consumers must select `--i64 number` explicitly.
The model emitter applies the mode to typedefs,
fields, method arguments/results, collections, map keys, and executable constants.
Enums and other numeric types remain `number`. The mode is recorded in
`generation.json`; metadata remains unchanged. Large IDL literals outside the JS
safe integer range are still rejected in both modes until exact parsing is added.

Native generated serialization will use `bigint` internally. In number mode,
recursive conversion must cover arguments, results, declared exceptions, structs,
unions, collections, and map keys; reject unsafe input numbers and decoded values
outside the safe number range. Bigint mode must retain bigint at that boundary
and validate signed i64 bounds. These runtime checks are not implemented yet.

An empty optional struct `{}` remains present. Only `null` and `undefined` denote
absence at the public conversion boundary. Preserve false, zero, and empty strings.

The old public `binary` declaration is `string` while the old decoder can return
`Buffer`. Retain the declaration for now and resolve runtime compatibility from
actual consumer usage before changing it.

## Native Thrift generator: next stage

Generate codecs and typed Promise clients from the resolved schema. Resolve field
IDs, wire types, aliases, recursive references, defaults, service inheritance, and
result/exception structures in an internal model without changing legacy metadata.

The generator and runtime must agree on native `Map`/`Set`, bigint serialization,
unknown-field skipping, recursion limits, required fields, and error handling.
Do not route complex map keys through plain JS objects.

Use the existing TS model emitter as the start of the native generator. Add
serialization and RPC generation incrementally through a small end-to-end service,
then validate real Damsel protocols. Do not implement a second handwritten parser
unless tests establish that the existing parser cannot meet required semantics.

The runtime must preserve Thrift Binary Protocol and Woody HTTP conventions:
endpoint configuration, per-call authentication/tracing headers, timeout,
cancellation, and distinct transport, application, and declared exceptions.
Compiler dependencies must stay out of browser runtime bundles.

## Optional Apache reference path

`--target apache` uses an explicitly version-checked 0.24.0 executable with
`--gen js:node,bigint`. It emits internal CommonJS alongside models and metadata.
`--compiler` selects the executable and is rejected for other targets.
The public `--i64` mode does not change the reference JS generator's bigint mode.

Apache output expects `toBigInt`/`fromBigInt`, symbol-based structure methods,
recursion helpers, and UUID imports. Its bigint mode still bridges through Int64.
Those contracts describe the reference output; they do not dictate the native
runtime design.

Object-backed maps, callback-name collisions, and flat service-file collisions are
validated only for this target. Full Damsel reference JS generation is blocked by
`accounter.InvalidPostingParams.wrong_postings`, a `map<Posting, string>`.
Damsel metadata and model generation are no longer blocked by that restriction.

## Validation and rollout

Normal tests exercise metadata compatibility, standalone CLI execution, output
preservation, and compiled enum behavior without a Thrift installation. Optional
Apache tests check real generated JS and reference compiler failures.

For native serialization, cross-decode new messages with the old runtime and old
messages with the new runtime. Include signed i64 boundaries, nested containers,
struct-keyed maps, binary values, exceptions, and unknown fields. A codec round trip
against itself is insufficient to establish wire compatibility.

The Damsel namespace selection remains:

```text
domain_config_v2 domain payment_processing accounter webhooker api_extensions proxy_provider
```

Metadata for these entries and their 15 reachable modules matches the legacy
baseline, and the generated TS models type-check. HTTP calls, forms, and consumer
migration remain unverified. Regenerate affected packages before migrating
consumers; old bundles may still embed woody_js.

## References

- [Previous metadata and TS generator](https://github.com/valitydev/thrift-ts)
- [Previous frontend CLI](https://github.com/valitydev/frontend-thrift-codegen)
- [Woody runtime](https://github.com/valitydev/woody_js)
- [Vality Thrift fork](https://github.com/valitydev/thrift)
- [Apache 0.24 reference generator](https://github.com/apache/thrift/blob/v0.24.0/compiler/cpp/src/thrift/generate/t_js_generator.cc)
- [Damsel build reference](https://github.com/valitydev/damsel/blob/8d6174bddedc6d9aefa407fdc1d54877b8686ff9/package.json)
