# TsThrift

TypeScript models, form metadata, and a Thrift client toolchain with an Apache
JavaScript backend. Compatibility with existing Vality protocol packages is a
release requirement; current output is not yet a drop-in replacement.

## Status

Implemented:

- Legacy-format `metadata.json` with selected entry files and reachable includes.
- TS models, executable constants, full enums, and Promise client interfaces.
- Public i64 as bigint by default, or number with `--i64 number`.
- Apache 0.24 JS generation using `js:node,es6,bigint`.
- Executed Apache Promise client/processor tests for callback-named IDL arguments,
  bigint values, and declared exceptions, without compiler patches.
- Staged output replacement and protection of unrelated files.
- An experimental low-level Binary Protocol runtime with cross-implementation tests.

The intended production path reuses Apache serialization and adds public data
conversion and a Woody-compatible HTTP transport. Map compatibility, browser
packaging, public clients, React Query helpers, and Angular service output remain
pending. The experimental binary runtime is not connected to generated clients;
expanding it into another full serializer is not the current implementation priority.

## Generate

```sh
vp install
vp run build
node dist/cli.mjs --input ./proto --output ./generated
```

| Target             | Output                                   | External compiler    |
| ------------------ | ---------------------------------------- | -------------------- |
| `models` (default) | TS models and metadata                   | None                 |
| `metadata`         | Metadata only                            | None                 |
| `apache`           | Models, metadata, and internal Apache JS | Apache Thrift 0.24.0 |

```sh
node dist/cli.mjs --input ./proto --output ./generated --target metadata
node dist/cli.mjs --input ./proto --output ./generated --i64 number
node dist/cli.mjs --input ./proto --output ./generated --target apache \
  --compiler /path/to/thrift-0.24.0
```

Repeat `--include` and `--namespace` to select include roots and entry filenames
without `.thrift`. Without `--namespace`, all top-level input files are entries.
Only referenced files are loaded from include roots. `--compiler` requires the
Apache target. ES6 output still uses CommonJS modules; it selects Promise clients,
not ESM module packaging.

All targets emit `metadata.json`, `generation.json`, and `.tsthrift.json` ownership
information. Models go into `models/`; Apache JS goes into `internal/` and imports
`thrift` and `uuid`. These are intermediate artifacts, not a generated package.
Use a dedicated output directory. Generation preserves prior output on failure
and refuses unmanaged directories or additional unowned files.

## Public values

`--i64 bigint` is the default for fields, typedefs, method signatures, collection
keys/values, and constants such as `42n`. `--i64 number` preserves numeric public
representations for existing consumers. Enums and other numeric types remain
number. Compile bigint sources with ES2020 or newer.

The API accepts `generate({ input, output, i64: "number" })`. The mode is recorded
in `generation.json` and does not change the legacy metadata AST. Apache internal
JS always uses bigint. Recursive conversion between public and internal values
is not implemented yet.

Enums are ordinary exported TS enums: both `Status.ACTIVE` and `Status[4]` work
at runtime after TypeScript compilation. Collections use Map, Set, and arrays.

## Compatibility limits

Stock Apache JS uses object-backed maps even in ES6 mode. Struct-keyed maps can
lose data and remain rejected by the Apache target. Metadata and models support
them. A transport replacement alone cannot fix generated map serialization.

The legacy parser stores numeric literals as JS numbers. Integral IDL literals
outside the safe range are rejected in both modes; exact constant parsing is
pending. Public binary still has the legacy string declaration; its conversion
to runtime bytes needs a consumer compatibility decision.

The existing metadata baseline and 15 complex reference IDL modules have been
verified. Angular services, forms, HTTP behavior, and package exports still need
consumer validation. Use `--i64 number` for compatibility builds; matching types
alone does not preserve the old Observable service API.

## Development

```sh
vp check
vp test
vp run build
THRIFT_COMPILER=/path/to/thrift-0.24.0 vp test
```

Without `THRIFT_COMPILER`, external-compiler integration tests skip. Binary runtime
tests use pinned npm development dependencies and still run.

- [Source audit and compatibility requirements](docs/compatibility.md)
- [Architecture and framework adapter boundaries](docs/architecture.md)
- [Implementation checklist](docs/tasks.md)
- [Experimental binary runtime](docs/runtime.md)
