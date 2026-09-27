# TsThrift

TypeScript models, legacy-compatible form metadata, and Promise RPC clients for
Thrift Binary Protocol. The native backend generates clients without the Apache
compiler, npm runtime, or Buffer polyfill. Existing Vality application APIs still
require consumer migration and acceptance testing.

## Generate

```sh
vp install
vp run build
node packages/cli/dist/cli.mjs --input ./proto --output ./generated --target native
```

| Target             | Output                                                 | External compiler |
| ------------------ | ------------------------------------------------------ | ----------------- |
| `models` (default) | TS models and metadata                                 | None              |
| `metadata`         | Metadata only                                          | None              |
| `native`           | Models, codecs, Promise clients, metadata              | None              |
| `apache`           | Models, Promise wrappers, internal Apache JS, metadata | Apache 0.24.0     |

Repeat `--include` for include roots and `--namespace` for entry filenames without
`.thrift`. Without `--namespace`, all top-level IDL files are entries. Only reachable
includes are loaded. `--i64 number` selects safe numeric values instead of bigint.
`--compiler` is accepted only with `--target apache`.

Use a dedicated output directory. Generation stages output, preserves previous
artifacts on failure, and rejects unrelated/unowned files. All targets record
their settings in `generation.json` and retain the legacy `metadata.json` AST.
Generated sources are intermediate artifacts, not installable protocol packages.

## Native clients

After compiling the generated TypeScript as ESM, or through a TS-aware bundler:

```ts
import { createExampleClient } from "./generated/clients/example/Example.js";

const client = createExampleClient({
  endpoint: "/rpc/example",
  headers: () => ({ Authorization: "Bearer token" }),
  timeoutMs: 10_000,
});

const controller = new AbortController();
const value = await client.next(42n, { signal: controller.signal });
```

The root also exports `clients.example.createExampleClient` and model namespace
`example`. `clients.SERVICES["example.Example"]` and `clients.SERVICES_LIST` contain
factory/DI descriptors and lazy metadata loaders. Duplicate service names in
different IDL modules are supported.

Native clients import `@vality/tsthrift/native`. Their values are plain objects,
Map (including struct keys), Set, arrays, and Uint8Array for binary. Optional empty
structs remain present. Bigint preserves signed i64; number mode rejects unsafe
values. Declared exceptions reject as decoded plain objects; server application
exceptions use `ThriftApplicationError`. A byte transport or fetch implementation
can be supplied for framework integration.

RPC calls do not load metadata or convert values into Apache classes. The native
entry has no Node or Buffer dependency. Apache and Buffer are optional peers used
only by the older Apache/root client entry; install `thrift@0.24.0` and `buffer`
when using that backend.

## Compatibility limits

- Native binary uses Uint8Array. The models/apache targets retain their historical
  string declaration; consumers using strings or Buffer methods need adaptation.
- Unsafe integral IDL literals remain rejected because the legacy parser cannot
  preserve their exact values in metadata.
- Stock Apache generation still rejects struct-keyed maps. Native generation
  preserves those keys directly.
- Metadata fixtures and generated output have been verified; live form consumers,
  decorated Angular services, Observable API compatibility, package publishing,
  and production-service acceptance remain pending.
- UUID model generation is not supported. Native output is ESM-oriented; isolated
  CJS protocol-package acceptance is pending.

## Development

```sh
vp check
vp run build
vp test
THRIFT_COMPILER=/path/to/thrift-0.24.0 vp test
```

Native tests compile and execute generated clients in both i64 modes, cross-decode
with Apache, exercise real local HTTP, and run a browser-targeted bundle without
Node globals. Only older external-compiler tests skip without `THRIFT_COMPILER`.

- [Compatibility audit](docs/compatibility.md)
- [Architecture](docs/architecture.md)
- [Implementation checklist](docs/tasks.md)
- [Binary runtime](docs/runtime.md)
