# TsThrift

A framework-independent TypeScript toolchain for Thrift IDL. The current stage
ports compatible metadata generation and emits public TS models with real enums.
The next stage will generate serialization and RPC code from the same schema.

Metadata and models require no external Thrift compiler. Apache Thrift 0.24 remains
an optional reference generator for compatibility checks. Updating the Vality C++
fork is no longer a prerequisite or the planned production generation path.

## Status

Implemented:

- Legacy-format `metadata.json` generation with reachable include resolution.
- Public TS models, executable constants, and Promise client
  interfaces, with public `i64` represented as `number` (default) or `bigint`.
- Full exported TypeScript enums with numeric values and reverse mappings after
  compilation, not type-only declarations or `const enum`.
- Constant and enum references, structured constants with defaults, and nested
  Map/Set/list values, including struct-keyed map constants.
- Standalone metadata output and optional Apache-generated internal JS.
- Staged output replacement with protection for previous output and unrelated files.

The native serializers, public client runtime, HTTP transport, number/bigint
conversion, and installable protocol package build are still pending. Client
interfaces do not instantiate working clients. Model output is TypeScript source;
consumers compile it to JavaScript until package building is implemented.

- [Architecture and compatibility decisions](docs/architecture.md)
- [Implementation checklist](docs/tasks.md)

## Generate

Build the CLI:

```sh
vp install
vp run build
```

Generate metadata and public TS models, including enums:

```sh
node dist/cli.mjs \
  --input ./tests/fixtures/proto \
  --include ./tests/fixtures/dependency \
  --namespace example \
  --output ./generated
```

Generate only metadata:

```sh
node dist/cli.mjs --input ./proto --output ./generated --target metadata
```

Choose the public `i64` representation with `--i64 number|bigint`:

```sh
node dist/cli.mjs --input ./proto --output ./generated --i64 bigint
```

The default `number` preserves existing consumer types. Opting into `bigint`
changes i64 typedefs, fields, method arguments/results, collection keys/values,
and executable constants (for example, `42n`). Other numeric types and enums stay
`number`. Compile bigint models with an ES2020 or newer target.
The programmatic API accepts `generate({ input, output, i64: "bigint" })`.
The selected mode is recorded in `generation.json`; `metadata.json` keeps its
original Thrift types and values in both modes. Apache reference JS always uses
internal bigint regardless of this public option. Runtime conversion is pending.

The available targets are:

| Target             | Output                                     | External compiler    |
| ------------------ | ------------------------------------------ | -------------------- |
| `models` (default) | TS models and metadata                     | None                 |
| `metadata`         | Metadata only                              | None                 |
| `apache`           | Models, metadata, and reference JS clients | Apache Thrift 0.24.0 |

For the reference path, pass `--target apache --compiler /path/to/thrift-0.24.0`.
`--compiler` is rejected for other targets so it cannot be silently ignored.
Repeat `--include` and `--namespace` for multiple values. Without `--namespace`,
all top-level `.thrift` files in `--input` are entries. Include directories are
searched for referenced files only.

All targets write `metadata.json`, `generation.json`, and an ownership manifest
`.tsthrift.json`. Model sources go into `models/`. The `apache` target additionally
writes unbundled CommonJS into `internal/`; it requires compatible `thrift` and
`uuid` runtime packages.

Use a dedicated output directory. Failed generation preserves previous output.
Regeneration rejects unmanaged directories and additional user files, then replaces
owned output and removes stale generated files, including when switching targets.

## Enums

For `enum Status { NEW, ACTIVE = 4, CLOSED }`, the model contains:

```ts
export enum Status {
  NEW = 0,
  ACTIVE = 4,
  CLOSED = 5,
}
```

After TypeScript compilation, both `Status.ACTIVE === 4` and
`Status[4] === "ACTIVE"` work in JavaScript. Tests compile and execute generated
enums, including negative values, implicit values, and aliases.

## Compatibility and limitations

Metadata for the 15 reachable modules selected by the existing Damsel command was
compared with `@vality/thrift-ts@2.5.1-2b658f2.0`: parsed JSON matched exactly.
All 15 generated TS model modules passed type checking in both i64 modes, with
identical metadata. This is source/model
verification, not proof of HTTP or Angular integration.

Struct-keyed maps such as Damsel's `map<Posting, string>` are supported in metadata
and public `Map` types. Only the optional `apache` target rejects them, because its
JS objects cannot preserve such keys. Callback-name restrictions and flat JS file
collisions are also Apache-target checks, not metadata restrictions.

The parser remains pinned to `thrift-parser@0.4.2`. Integral IDL literals outside
the JS safe integer range are rejected in both i64 modes because the parser has
already lost their precision. Exact large-constant parsing remains pending;
`--i64 bigint` currently selects public types and safely parsed constant values.
Constant references are resolved during model
generation, with diagnostics for cycles, invalid scalar values, missing fields,
and invalid unions. Metadata preserves the original expressions. The legacy parser
still limits accepted IDL syntax; broader parser coverage remains a follow-up.
Duplicate module basenames remain unsupported. Public `binary` retains the old `string` declaration pending a
separate runtime compatibility decision.

## Development

```sh
vp check
vp test
vp run build
```

Metadata and enum runtime tests need no Thrift installation. To also run the
optional reference-compiler tests:

```sh
THRIFT_COMPILER=/path/to/thrift-0.24.0 vp test
```

Only Apache integration tests are skipped when `THRIFT_COMPILER` is unset.
