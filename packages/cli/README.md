# @vality/tsthrift-cli

Pure TypeScript compiler and code generator for Apache Thrift IDL files.

`@vality/tsthrift-cli` compiles `.thrift` definitions into type-safe TypeScript interfaces, modular runtime metadata, and framework-agnostic RPC client factories. No external Apache Thrift compiler or native binary tools are required.

## Features

- **Pure TypeScript compiler:** Built with `@vality/tsthrift` and a TypeScript IDL parser; requires Node.js ^24.11 or >=26.
- **TypeScript model generation:** Generates precise interfaces for structs, unions, exceptions, consts, and enums.
- **Modular split metadata:** Emits lightweight per-namespace metadata modules and local `load-metadata.ts` loaders that lazily load transitive includes on demand.
- **Service factories & registry:** Generates typed service client factories (`create<Service>`) and registry descriptors (`THRIFT_SERVICES`, `THRIFT_SERVICES_LIST`) compatible with Angular and pure TypeScript.
- **Distribution build:** Builds generated code into a modern ESM package (`.mjs` modules and `.d.mts` declarations preserving source paths) with `--bundle`.
- **Configurable `i64` representation:** Choose between `bigint` (exact signed 64-bit integers) or safe `number`.
- **Native UUID support:** Generates TypeScript `string` types for built-in Thrift `uuid` fields, backed by 16-byte fixed-width binary encoding (`WireType.Uuid = 16`).
- **Transitive include resolution:** Correctly handles complex include graphs and cross-namespace type references.

## Installation

```sh
npm install --save-dev @vality/tsthrift-cli
# or
pnpm add -D @vality/tsthrift-cli
```

## CLI Usage

```sh
npx --package @vality/tsthrift-cli tsthrift-cli --input "proto/**/*.thrift" [options]
```

### Options

| Flag                         | Description                                                                       | Default     |
| ---------------------------- | --------------------------------------------------------------------------------- | ----------- |
| `-i, --input <path/glob>`    | Thrift file, directory, or glob pattern (repeatable)                              | _Required_  |
| `-o, --output <dir>`         | Directory for generated TypeScript sources                                        | `generated` |
| `--bundle`                   | Build the distribution: ESM `.mjs` and `.d.mts`, preserving module paths          | `false`     |
| `-d, --dist <dir>`           | Distribution output directory                                                     | `dist`      |
| `--sourcemap`                | Emit source maps in the distribution                                              | `false`     |
| `-I, --include <dir>`        | Additional include root directory (repeatable)                                    | `[]`        |
| `-e, --external <ns>=<path>` | External module mapping, or a whole npm package name (repeatable)                 | `[]`        |
| `-m, --main <namespace>`     | Re-export one local namespace from the root (automatic for a single local module) | _Unset_     |
| `--no-models`                | Generate only `metadata.json` without models or services                          | `false`     |
| `--no-services`              | Generate models and metadata without service factories                            | `false`     |
| `--metadata-json`            | Emit monolithic `metadata.json` in output directory                               | `false`     |
| `--binary <mode>`            | Public `binary` representation: `base64` (`string`) or `uint8array`               | `base64`    |
| `--i64 <mode>`               | Public `i64` representation: `bigint` (default) or `number`                       | `bigint`    |
| `--lower-case-methods`       | Generate service client methods starting with a lowercase letter                  | `false`     |
| `--allow-duplicate-modules`  | Allow duplicate module basenames across includes (first-wins)                     | `false`     |
| `-h, --help`                 | Show help and exit                                                                |             |

### Examples

#### Basic generation

```sh
npx --package @vality/tsthrift-cli tsthrift-cli --input ./proto --output ./src/generated
```

#### Compiled distribution

Generate TypeScript sources into `./generated` and build them into ESM `.mjs` and `.d.mts` files in `./dist`, preserving source module paths:

```sh
npx --package @vality/tsthrift-cli tsthrift-cli --input "proto/**/*.thrift" --bundle --dist ./dist
```

#### External npm package namespaces

Consume an already compiled protocol package instead of recompiling or duplicating its models:

```sh
npx --package @vality/tsthrift-cli tsthrift-cli \
  --input ./proto \
  --external base=@vality/base-proto/base
```

The installed package supplies the module's schema: the compiler reads its published `thriftMetadata`
(and the metadata closure from its root or namespace loader), so no `.thrift` sources are needed and
`include "proto/base.thrift"` resolves through the package.

The two flags have separate roles: `--include` adds `.thrift` search roots whose modules are compiled
locally, while `--external` only consumes already built packages. A module mapped by `--external` is
always read from the package metadata; its `.thrift` file is never parsed, even if it is on `--include`.

To map every module of a protocol package, pass its name without `<ns>=`:

```sh
npx --package @vality/tsthrift-cli tsthrift-cli --input ./proto --external @vality/bouncer-proto
```

Each `include` that cannot be found on disk is looked up by its file basename as
`@vality/bouncer-proto/<module>`, so directory parts such as `proto/` in `include "proto/context.thrift"`
do not matter. Packages are searched in the order given, and only for includes that are not found through `--input`/`--include`; explicit `<ns>=<path>` mappings always take precedence.

When generating or bundling:

- Models and services import directly from `@vality/base-proto/base`.
- Transitive metadata loaders dynamically resolve external metadata and pass the module name to root `loadThriftMetadataByNamespaces(namespace)` loaders. Namespace `loadThriftMetadata()` loaders return their full dependency closure; older external root loaders named `loadThriftMetadata` remain supported. Both package-root and namespace-subpath loaders are supported.
- Root `metadata.ts` emits an `EXTERNAL_NAMESPACES` dictionary descriptor.
- The external package (`@vality/base-proto`) is automatically excluded from the bundle output, including its subpath imports.

External mappings use the `.thrift` file basename, not a language-specific namespace.
Each mapping applies to one module; map transitive modules explicitly when they are
also owned by external packages. Unknown mappings are rejected, and the referenced npm package must be installed at generation time. Declare the package as a dependency of the
published protocol package; generation does not edit package manifests.

External and local packages must use compatible IDL revisions and the same `--i64`
mode and `--binary` representation. Inherited service interfaces must also use the same `--lower-case-methods`
setting. The CLI does not infer these settings from installed declarations or convert
between number and bigint models. A package-root mapping must export the referenced
models/services; use namespace subpaths for multi-module packages.

Generated TypeScript omits external modules and loads their metadata from the package.
Standalone `metadata.json` includes the complete IDL closure, including external modules,
so `--no-models` output remains usable without an npm loader. The programmatic
`metadataPath` option can select a separate metadata entry exporting `loadThriftMetadataByNamespaces`, `loadThriftMetadata`,
`thriftMetadata`, `metadata`, or a default metadata object/array.

The CLI prefers `<importPath>/metadata` when it resolves to an existing exported module.
A namespace metadata export maps to `dist/<namespace>/load-metadata.mjs` and its
`.d.mts` declaration, as shown in the package manifest below. It exports
`loadThriftMetadata` and `TSTHRIFT_BUILD`, loads the selected namespace and its
transitive includes, and imports no models or services. Other namespaces remain unloaded;
each selected namespace's AST is loaded in full. Explicit `metadataPath` takes precedence.
Packages without this export retain namespace entrypoint loading. Errors inside an
available metadata entrypoint propagate rather than triggering a namespace fallback.
Legacy metadata entries without `TSTHRIFT_BUILD` use the model entrypoint for build checks.

#### With multiple include roots

```sh
npx --package @vality/tsthrift-cli tsthrift-cli \
  --input "proto/**/*.thrift" \
  --include ./vendor/proto \
  --include ./shared/proto
```

#### Binary representation

IDL `binary` generates `string` containing Base64 by default (`--binary base64`). Use
`--binary uint8array` (or `generate({ ..., binary: "uint8array" })`) for raw bytes.
This applies to fields, typedefs, collections, constants, defaults, and service
parameters/results. Generated factories bind the selected mode. Both modes send
raw bytes on the wire; IDL `string` remains UTF-8 text.

#### Safe number mode for i64

```sh
npx --package @vality/tsthrift-cli tsthrift-cli --input ./proto --i64 number
```

## Generated Output Structure

The generated root exports `THRIFT_NAMESPACES`, an alphabetically sorted readonly tuple
of local and external module names accepted by `loadThriftMetadataByNamespaces`. Names are `.thrift`
file basenames, matching generated directories, rather than language-specific IDL namespaces.
Reading the list does not invoke metadata loaders. `EXTERNAL_NAMESPACES` retains external
module descriptors when external modules are present.
Modules returned only inside an external loader's dependency closure are not separate root keys.

```ts
import { THRIFT_NAMESPACES, loadThriftMetadataByNamespaces } from "sample-proto";
import { loadThriftMetadata } from "sample-proto/payment";

const selected = await loadThriftMetadataByNamespaces(["base", "payment"]);
const all = await loadThriftMetadataByNamespaces(THRIFT_NAMESPACES);
const payment = await loadThriftMetadata();
```

The root loader requires a name or readonly list of names from `(typeof THRIFT_NAMESPACES)[number]`.
Unknown names are rejected by TypeScript. It returns one `Metadata[]`
containing the selected modules and their transitive dependencies, deduplicated by module name
in selection/dependency order. An empty list returns `[]`; an unknown name rejects the call.
Namespace-local loaders keep their zero-argument signature. Successful namespace loads stay
cached across selections; failed loads can be retried. Root imports previously using
`loadThriftMetadata` must use `loadThriftMetadataByNamespaces` after regeneration.

When compiling a schema (for example, with namespaces `base` and `payment`), the output directory contains:

```text
generated/
├── index.ts                     # Metadata loader, service registry, and optional main namespace
├── metadata.ts                  # Root loadThriftMetadataByNamespaces lazy loader
├── services.ts                  # Global THRIFT_SERVICES and THRIFT_SERVICES_LIST registry
├── base/                        # Namespace directory for `base`
│   ├── index.ts                 # Namespace entry point (models + metadata + loader)
│   ├── models.ts                # TypeScript models, structs, enums, consts
│   ├── metadata.ts              # Local AST metadata module
│   └── load-metadata.ts         # Local transitive metadata loader
├── payment/                     # Namespace directory for `payment`
│   ├── index.ts                 # Namespace entry point (models + services + metadata + loader)
│   ├── models.ts                # TypeScript models for payment
│   ├── metadata.ts              # Local AST metadata module
│   ├── load-metadata.ts         # Local transitive metadata loader
│   └── services/                # Service interfaces, factories, and descriptors
│       ├── PaymentProcessing.ts # PaymentProcessing interface, factory, descriptor
│       └── index.ts
└── tsconfig.json                # Bundler-ready TypeScript configuration
```

## Protocol Package Setup

For repositories that distribute generated TypeScript models and clients from `.thrift` files, configure `package.json` as follows:

```json
{
  "name": "sample-proto",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "build": "tsthrift-cli --input proto --bundle"
  },
  "main": "./dist/index.mjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.mts",
  "exports": {
    ".": {
      "types": "./dist/index.d.mts",
      "import": "./dist/index.mjs"
    },
    "./*": {
      "types": "./dist/*/index.d.mts",
      "import": "./dist/*/index.mjs"
    },
    "./*/metadata": {
      "types": "./dist/*/load-metadata.d.mts",
      "import": "./dist/*/load-metadata.mjs"
    },
    "./proto/*": "./proto/*",
    "./package.json": "./package.json"
  },
  "files": ["dist", "proto"],
  "dependencies": {
    "@vality/tsthrift": "^0.1.0"
  },
  "devDependencies": {
    "@vality/tsthrift-cli": "^0.1.0"
  }
}
```

## Programmatic API

The compiler can also be driven programmatically from Node.js scripts or build tools:

```ts
import { generate } from "@vality/tsthrift-cli";

const result = await generate({
  input: "proto/**/*.thrift",
  output: "./generated",
  bundle: true,
  dist: "./dist",
  i64: "bigint",
  includes: ["./vendor/proto"],
});

console.log(`Generated modules: ${result.modules.join(", ")}`);
```

## Output ownership and bundling

Use separate dedicated directories for generated sources and bundles. Each output
contains `.tsthrift.json`, listing generated files. Regeneration refuses unowned
nonempty directories, symbolic links, and additional handwritten files. Outputs
from earlier versions without a manifest must be moved aside before regeneration.
Compile sources into a separate directory; do not emit JS beside generated TS.

`--bundle` builds a modern ESM package with `tsdown` (rolldown), provided by `@vality/tsthrift-cli`: source module paths are preserved using `unbundle` mode. For example, `<module>/models.ts` becomes `<module>/models.mjs` and `<module>/models.d.mts`; service modules retain their `<module>/services/` paths. Root and namespace entry points remain `index.mjs` and `<module>/index.mjs`. Metadata behind dynamic `import()` stays lazy. Installed dependencies such as `@vality/tsthrift` and external protocol packages stay external. Output is not minified; source maps are opt-in via `--sourcemap`. It ignores consumer build configuration and leaves the consumer package manifest unchanged. The bundler does not type-check the generated sources. Source and distribution paths must not overlap.
The package recipe uses example versions; select the published tsthrift versions
when installing dependencies.

## Requiredness

Generated fields marked `/** @remarks requiredness */` are declared in the IDL without `required` or
`optional`.

- `required`: always present; the decoder rejects data without it.
- `optional`: typed optional (`"a"?: T`).
- No keyword: typed as present (`"a": T`), matching the legacy generator, but the decoder does not
  enforce it. A peer may omit the field, and the value is then `undefined` at runtime.

Union members are always optional.

## Known Limitations

- **IDL numeric constants:** Integer constants and default values in `.thrift` files are constrained to JavaScript safe integer bounds (`Number.MIN_SAFE_INTEGER` to `Number.MAX_SAFE_INTEGER`, i.e., ±(2^53 - 1)). This constraint exists because the underlying IDL parser (`thrift-parser`) tokenizes numeric literals into standard JavaScript `Number` (IEEE-754 double precision float), and the JSON-compatible metadata AST format cannot serialize 64-bit `bigint` literals without loss of precision. Rather than silently rounding constants exceeding 53 bits (e.g., `9223372036854775807` turning into `9223372036854776000`), the compiler explicitly rejects unsafe literals at compile time. Runtime RPC parameters, structs, and network payloads preserve the full signed 64-bit range via `bigint`.

## License

Apache-2.0

## Generated package compatibility

Every generated root/namespace exports `TSTHRIFT_BUILD` with `metadataVersion`, `i64`,
`binary`, and `lowerCaseMethods`. Bundling verifies installed external packages against this marker
using Node ESM resolution. Plain source generation does not require installed dependencies;
runtime metadata initialization also rejects incompatible generated settings.
Regenerate external packages missing the marker before bundling them together.
Metadata JSON retains the legacy array/AST shape and adds `metadataVersion: 1` and the selected `build` settings.
The runtime accepts unversioned legacy metadata but rejects unsupported explicit versions.

Only explicit `required` fields and fields with concrete defaults are emitted as required
properties. Declared exception types use qualified module names. Published output is ESM-only;
use TypeScript 5.1+ with `node16`, `nodenext`, or `bundler` resolution. Bundled output is unminified.
