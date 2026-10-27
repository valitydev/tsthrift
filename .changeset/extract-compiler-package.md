---
"@vality/tsthrift-compiler": minor
"@vality/tsthrift-cli": patch
---

Extract the environment-independent compiler core into `@vality/tsthrift-compiler`:
`parseThrift`, schema validation, and `emitProject`, which returns the generated package as
in-memory files without Node imports. `@vality/tsthrift-cli` keeps file-system input discovery,
external package resolution, output publication, and the `--bundle` build, and delegates
generation to the compiler. CLI options and generated output are unchanged.
