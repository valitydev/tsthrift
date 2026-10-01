---
"@vality/tsthrift": minor
"@vality/tsthrift-cli": minor
---

Rename the generated root loader to `loadThriftMetadataByNamespaces` and accept a required namespace name or readonly list of names. Arguments are restricted to the generated `THRIFT_NAMESPACES` union. Pass `THRIFT_NAMESPACES` to load all available namespaces. Combined results deduplicate shared dependencies while preserving per-namespace caching and retries. Runtime loader factories infer allowed names from their dependency keys.

Namespace-local `loadThriftMetadata()` keeps its name and zero-argument signature. Update root imports to use the new name; runtime and CLI loading continue to accept older external packages exporting `loadThriftMetadata`.

When providing a root loader to a metadata client, use an explicit selection callback such as `metadata: () => loadThriftMetadataByNamespaces("payment")`.
