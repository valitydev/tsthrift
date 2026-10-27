# @vality/tsthrift-compiler

Environment-independent Thrift IDL compiler core. It compiles IDL held in memory into runtime
metadata and the same generated TypeScript files as `@vality/tsthrift-cli`, without reading or
writing the environment: no `node:*` imports, file system, child processes, or package resolution.
It runs in browsers, Web Workers, and Node.js. Runtime dependencies are `@vality/tsthrift` and
`thrift-parser`.

Use `@vality/tsthrift-cli` to generate from files on disk.

## Compile and call from memory

```ts
import { createMetadataClient } from "@vality/tsthrift";
import { compileSources } from "@vality/tsthrift-compiler";

const { metadata, client: modes } = await compileSources(
  {
    "proto/example.thrift":
      'include "shared/common.thrift"\nservice Example { string echo(1: string value) }',
    "dependency/shared/common.thrift": "typedef string Identifier",
  },
  { entries: ["proto/example.thrift"], includeRoots: ["dependency"] },
);

const example = await createMetadataClient({
  metadata,
  namespace: "example", // the module name: the file name without `.thrift`
  serviceName: "Example",
  endpoint: "https://api.example.com/thrift",
  ...modes, // i64Mode, binaryMode, and lowerCaseMethods matching the metadata
});
```

`compileSources(sources, options)` takes a `Record` or `Map` of file path to IDL text and returns:

- `metadata`: the `Metadata[]` closure of the compiled modules, accepted by `createMetadataClient`.
- `client`: the `i64Mode`, `binaryMode`, and `lowerCaseMethods` options matching the metadata.
- `files`: the generated TypeScript package as `{ path, content }[]` with POSIX relative paths;
  empty unless `emit: true`.
- `schema`: the validated include graph.

Options: `entries` (default: every `.thrift` source), `includeRoots`, `allowDuplicateModules`,
`warn`, `emit`, `i64` (`bigint` default or `number`), `binary` (`base64` default or `uint8array`),
`lowerCaseMethods`, `services`, `main`, and `external`.

`external` is published `Metadata[]` (for example a protocol package's `metadata.json`) that
sources may include without providing the `.thrift` files. Modules from it join `metadata` but not
the emitted `files`; the pool does not need to be fully reachable.

Includes resolve next to the including file, then in `includeRoots`, using POSIX paths. Errors
(syntax, missing or circular includes, duplicate module names, unresolved types) are thrown as
`Error` with the referring file in the message.

## Building blocks

The pipeline behind `compileSources` is exported for hosts with their own file access:

- `parseThrift(source)` parses and structurally validates one IDL document.
- `buildSchema(roots, host, options)` walks the include graph through a `SchemaHost`
  (`canonical`, `read`, `resolveInclude`, `modulePath`, optional `warn` and `external`).
  `createMemoryHost` implements it over in-memory sources; the CLI implements it over the file
  system and installed packages. `programsFromMetadata` builds an external module from published
  metadata.
- `resolveProjectOptions`, `validateProject`, and `emitProject` validate a `Schema` and emit the
  generated package in memory. `projectEntries(schema)` lists the package entry points a bundler
  needs. `schemaMetadata(schema, build)` returns `Metadata[]`.
