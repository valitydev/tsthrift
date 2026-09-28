# @vality/tsthrift-cli

Pure TypeScript compiler and code generator for Apache Thrift IDL files.

`@vality/tsthrift-cli` compiles `.thrift` definitions into type-safe TypeScript interfaces, modular runtime metadata, and framework-agnostic RPC client factories. No external Apache Thrift compiler or native binary tools are required.

## Features

- **Pure TypeScript compiler:** Built with `@vality/tsthrift` and a TypeScript IDL parser; runs anywhere Node.js runs.
- **TypeScript model generation:** Generates precise interfaces for structs, unions, exceptions, consts, and enums.
- **Modular split metadata:** Emits lightweight per-namespace metadata modules that lazily load transitive includes on demand.
- **Service factories & registry:** Generates typed service client factories (`create<Service>`) and registry descriptors (`SERVICES`, `SERVICES_LIST`) compatible with Angular and pure TypeScript.
- **Standalone bundle compilation:** Compiles and bundles generated code into distribution-ready `.mjs` and `.d.mts` files with `--bundle`.
- **Configurable `i64` representation:** Choose between `bigint` (exact signed 64-bit integers) or safe `number`.
- **Transitive include resolution:** Correctly handles complex include graphs and cross-namespace type references.

## Installation

```sh
npm install --save-dev @vality/tsthrift-cli
# or
pnpm add -D @vality/tsthrift-cli
```

## CLI Usage

```sh
npx tsthrift-cli --input "proto/**/*.thrift" [options]
```

### Options

| Flag                        | Description                                                         | Default     |
| --------------------------- | ------------------------------------------------------------------- | ----------- |
| `-i, --input <path/glob>`   | Thrift file, directory, or glob pattern (repeatable)                | _Required_  |
| `-o, --output <dir>`        | Directory for generated TypeScript sources                          | `generated` |
| `--bundle`                  | Compile and bundle generated TypeScript into distribution directory | `false`     |
| `-d, --dist <dir>`          | Bundle distribution output directory                                | `dist`      |
| `-I, --include <dir>`       | Additional include root directory (repeatable)                      | `[]`        |
| `--no-models`               | Generate only `metadata.json` without models or services            | `false`     |
| `--no-services`             | Generate models and metadata without service factories              | `false`     |
| `--metadata-json`           | Emit monolithic `metadata.json` in output directory                 | `false`     |
| `--i64 <mode>`              | Public `i64` representation: `bigint` (default) or `number`         | `bigint`    |
| `--allow-duplicate-modules` | Allow duplicate module basenames across includes (first-wins)       | `false`     |
| `-h, --help`                | Show help and exit                                                  |             |

### Examples

#### Basic generation

```sh
npx tsthrift-cli --input ./proto --output ./src/generated
```

#### Bundled distribution

Generate TypeScript sources into `./generated` and bundle them into optimized `.mjs` and `.d.mts` artifacts in `./dist`:

```sh
npx tsthrift-cli --input "proto/**/*.thrift" --bundle --dist ./dist
```

#### With multiple include roots

```sh
npx tsthrift-cli \
  --input "proto/**/*.thrift" \
  --include ./vendor/proto \
  --include ./shared/proto
```

#### Safe number mode for i64

```sh
npx tsthrift-cli --input ./proto --i64 number
```

## Generated Output Structure

When compiling a schema (for example, with namespaces `base` and `payment`), the output directory contains:

```text
generated/
├── index.ts                     # Root re-exports of all namespaces and services
├── metadata.ts                  # Root loadMetadata(namespace) lazy loader
├── services.ts                  # Global SERVICES and SERVICES_LIST registry
├── base/                        # Namespace directory for `base`
│   ├── index.ts                 # Namespace entry point (models + metadata)
│   ├── models.ts                # TypeScript models, structs, enums, consts
│   └── metadata.ts              # Local AST metadata module
├── payment/                     # Namespace directory for `payment`
│   ├── index.ts                 # Namespace entry point (models + services + metadata)
│   ├── models.ts                # TypeScript models for payment
│   ├── metadata.ts              # Local AST metadata module
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
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "codegen": "tsthrift-cli --input \"proto/**/*.thrift\" --bundle",
    "build": "npm run codegen"
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
      "types": "./dist/*.d.mts",
      "import": "./dist/*.mjs"
    },
    "./proto/*": "./proto/*",
    "./package.json": "./package.json"
  },
  "files": ["dist", "proto"],
  "dependencies": {
    "@vality/tsthrift": "^1.0.0"
  },
  "devDependencies": {
    "@vality/tsthrift-cli": "^1.0.0"
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

## License

Apache-2.0
