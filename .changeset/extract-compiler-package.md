---
"@vality/tsthrift-compiler": minor
"@vality/tsthrift-cli": patch
---

Extract the environment-independent compiler core into `@vality/tsthrift-compiler`. It has no
Node imports and compiles IDL held in memory: `compileSources` returns runtime metadata, matching
`createMetadataClient` options, and optionally the generated TypeScript files. `buildSchema`
walks the include graph through a pluggable `SchemaHost`, with an in-memory host and support for
published external metadata. `@vality/tsthrift-cli` keeps file-system input discovery, external
package resolution, output publication, and the `--bundle` build as its `SchemaHost` and delegates
generation to the compiler. CLI options and generated output are unchanged.
