---
"@vality/tsthrift": minor
"@vality/tsthrift-cli": minor
---

Represent IDL binary values as Base64 strings by default (`--binary base64`). Add `--binary uint8array`
and `MetadataClientConfig.binaryMode` for raw byte values. Keep generated models,
constants, defaults, service factories, and metadata settings consistent, and reject
incompatible external package modes. Binary Protocol still transmits raw bytes;
IDL string remains UTF-8 text. Regenerate protocol packages to adopt the new default.
