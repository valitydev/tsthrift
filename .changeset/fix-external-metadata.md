---
"@vality/tsthrift-compiler": patch
"@vality/tsthrift-cli": patch
---

Include transitive external dependencies in metadata returned by `compileSources` and in
standalone `metadata.json`, deduplicating shared modules. Reject unsupported explicit external
metadata versions before reconstructing the include graph while accepting unversioned legacy
metadata.
