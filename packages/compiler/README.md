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

## Listing services and methods

`metadata` is plain data, so an interface can be built from it directly:

```ts
for (const module of metadata) {
  for (const [service, { functions }] of Object.entries(module.ast.service ?? {})) {
    for (const method of Object.values(functions)) {
      console.log(`${module.name}.${service}.${method.name}`, method.args, method.type);
    }
  }
}
```

A service's inherited methods (`extends`) are listed on the parent service, and `createMetadataClient`
exposes both.

## Browsers

The package has no Node imports and is exercised in Chromium against its built `dist`: compiling
IDL held in a string, calling a server with the metadata, and emitting the TypeScript package. It
needs a bundler, because the `thrift-parser` dependency is CommonJS. Web Workers and strict
Content-Security-Policy pages are not covered by the acceptance run.

## Not supported

File and glob input, output directories, `--bundle`, and installed-package resolution
(`--external <package>`) belong to `@vality/tsthrift-cli`. Generated code for modules passed through
`external` imports them by module name, not from an npm package path.

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
