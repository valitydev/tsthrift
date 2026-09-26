# TsThrift

A planned, framework-independent toolchain for generating TypeScript types,
JavaScript Thrift clients, and form metadata from Thrift IDL, with a compatible
binary HTTP runtime and one CLI.

Initially, JavaScript is generated with the official Apache Thrift 0.24 compiler.
After the JS generator in `valitydev/thrift` is updated and validated, generation
will switch to that fork without synchronizing the entire fork with upstream.
The fork update does not block the initial implementation.
Generated JavaScript will use `bigint` internally; public TypeScript APIs will
continue to expose `i64` as `number`.

Generated packages will be ordinary JS/TS libraries with Promise-based clients.
Angular providers, RxJS wrappers, and form rendering belong to consumers.
The existing metadata format remains a compatibility requirement for `ng-thrift`.

## Status

Design and implementation tasks are documented. The source code is still the
starter template; the compiler, runtime, and CLI are not implemented.

- [Architecture and compatibility decisions](docs/architecture.md)
- [Implementation checklist](docs/tasks.md)

## Development

- Install dependencies:

```bash
vp install
```

- Run the unit tests:

```bash
vp test
```

- Build the library:

```bash
vp pack
```
