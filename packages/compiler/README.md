# @vality/tsthrift-compiler

Environment-independent Thrift IDL compiler core. It turns parsed IDL into the same
generated files as `@vality/tsthrift-cli` without reading or writing the environment: no
`node:*` imports, file system, child processes, or package resolution. Runtime dependencies are
`@vality/tsthrift` and `thrift-parser`.

Use `@vality/tsthrift-cli` to generate from files on disk. Use this package when the IDL and the
output live in memory.

## API

```ts
import {
  emitProject,
  parseThrift,
  resolveProjectOptions,
  validateProject,
} from "@vality/tsthrift-compiler";
import type { Program, Schema } from "@vality/tsthrift-compiler";

const program: Program = {
  filename: "example.thrift",
  name: "example",
  path: "example.thrift",
  ast: parseThrift("service Example { string echo(1: string value) }"),
  includes: new Map(),
};
const schema: Schema = {
  roots: [program],
  programs: [program],
  localPrograms: [program],
  externalPrograms: [],
};

const options = resolveProjectOptions({ i64: "number" });
validateProject(schema, options);
const files = emitProject(schema, options); // { path, content }[] with POSIX relative paths
```

- `parseThrift(source)` parses and structurally validates one IDL document.
- `resolveProjectOptions(options)` applies defaults and rejects unknown `i64`/`binary` modes.
  `models: false` emits only `metadata.json`; `services: false` omits service factories.
- `validateProject(schema, options)` validates types, constants, and generated names. Call it
  before `emitProject`.
- `emitProject(schema, options)` returns `GeneratedFile[]`. `projectEntries(schema)` lists the
  package entry points, which a bundler needs.

A `Schema` is the include graph: each `Program` links the programs it includes by alias. Building
that graph from files, globs, include roots, and installed npm packages is the caller's
responsibility; the CLI implements it with the file system.

`metadata.json` contains the `Metadata[]` accepted by `createMetadataClient` from
`@vality/tsthrift`.
