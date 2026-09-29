---
"@vality/tsthrift-cli": minor
---

Emit retryable runtime loaders, explicit method allowlists, build compatibility markers, qualified exception types. Fields without an explicit requiredness are typed as present, as in the legacy generator; only `optional` fields and union members are optional. Stop emitting the `<Service>Descriptor` alias. The package API is limited to `generate` and its option types; internal emitters and the `./cli` subpath are no longer exported. Validate installed external build settings before bundling; publish readable ESM output without source maps by default (`--sourcemap` and `--minify` opt in) and require a supported Node toolchain.
