# @vality/tsthrift-compiler

## 0.1.1

### Patch Changes

- 8ac14df: Update workspace catalog dependencies and republish via automated release workflow.

## 0.1.0

### Minor Changes

- cbd1a03: Extract the environment-independent compiler core into `@vality/tsthrift-compiler`. It has no
  Node imports and compiles IDL held in memory: `compileSources` returns runtime metadata, matching
  `createMetadataClient` options, and optionally the generated TypeScript files. `buildSchema`
  walks the include graph through a pluggable `SchemaHost`, with an in-memory host and support for
  published external metadata. `@vality/tsthrift-cli` keeps file-system input discovery, external
  package resolution, output publication, and the `--bundle` build as its `SchemaHost` and delegates
  generation to the compiler. CLI options and generated output are unchanged.

### Patch Changes

- cbd1a03: Include transitive external dependencies in metadata returned by `compileSources` and in
  standalone `metadata.json`, deduplicating shared modules. Reject unsupported explicit external
  metadata versions before reconstructing the include graph while accepting unversioned legacy
  metadata.
- Updated dependencies [cbd1a03]
  - @vality/tsthrift@0.2.1
