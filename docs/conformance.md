# Latest Damsel binary conformance

Run the independent generated-code comparison from the repository root:

```sh
vp install
vp run test:conformance
```

Prerequisites are Git, Apache Thrift compiler **0.24.0**, and a JDK **17 or newer**
with `java` and `javac` available on PATH. The task is deliberately uncached and
clones the current default-branch HEAD of `https://github.com/valitydev/damsel.git`
on every run. A network connection is needed for that clone and Maven downloads;
RPC execution itself is entirely local, with no deployed service or credentials.
Normal `vp test` does not need Java, an external compiler, or these downloads.

For explicit executable paths or retained artifacts, invoke the suite directly
after `vp run build`:

```sh
THRIFT_COMPILER=/path/to/thrift JAVA=/path/to/java JAVAC=/path/to/javac \
  KEEP_CONFORMANCE_OUTPUT=1 \
  vp -C packages/cli test --config conformance.config.ts --reporter=verbose
```

The verbose output identifies the exact Damsel commit and temporary directory.
`provenance.json`, generated Java/TypeScript, compiled code, and binary request and
reply files are preserved when `KEEP_CONFORMANCE_OUTPUT=1`; otherwise the directory
is removed after the run. Missing tools, changed checksums, generation failures,
and mismatches fail the suite rather than skipping it.

## Independent reference

The official compiler generates Java from unmodified Damsel IDL and the committed
test IDL. It runs against `org.apache.thrift:libthrift:0.24.0`; the pinned runtime
and SLF4J API jars are downloaded from Maven Central and checked against committed
SHA-256 digests. No production dependency is added.

Java is used because its generated clients preserve struct and union map keys.
Stock Apache JavaScript generation uses object-backed maps and is unsuitable as
the sole reference for this contract. Neither generated Java nor upstream IDL is
patched. Test values are constructed independently in Java and TypeScript.

Each scenario compares the complete native request byte-for-byte with an official
generated Java client's request. An official generated `Processor` then decodes
the native request and checks the method and all arguments against the Java
values. It produces a reply which the native client decodes. Native metadata
codecs also encode successful/declared-exception reply objects for byte-for-byte
comparison with the official reply.

Map and set insertion order is intentionally the same on both writers. Binary
Protocol has no canonical map/set ordering: equivalent values with different
iteration orders need not have identical bytes. Cross-decoding and object/key
counts are checked separately from byte equality.

## Coverage

- Real `domain_config_v2.Repository.Commit` arguments and `CommitResponse` using
  `SystemAccountSet`, two distinct `CurrencyRef` map keys, optional subagent zero,
  nested unions, and a set of domain objects.
- A compound object containing bool, byte/i8, i16, i32, i64, double, UTF-8 strings,
  binary bytes 0 through 255, enum, typedef, struct, union, list, set, and map.
- Real Damsel `msgpack.Value` union keys and values in nested maps; two distinct
  keys must survive both directions. Binary data, lists, and empty structs occur
  inside those values.
- Empty strings/binary/collections, false, zero, present `{}`, and absent optional
  fields. Bigint tests include signed i64 minimum/maximum; number tests use safe
  integer minimum/maximum.
- Declared exceptions, void replies, and oneway messages.
- Two files both declaring `namespace js shared`, `service Echo`, method `echo`,
  and type `Payload`, with different payload shapes. Concurrent calls through the
  generated service registry must remain isolated by source module.
- `alpha.thrift` also declares `service alpha`, checking a service name equal to
  its module name. Duplicate source-file basenames remain explicitly rejected
  by the existing schema test, instead of silently overwriting output.

The nine conformance cases include both numeric modes and populated/empty value
variants. UUID is outside current generator support; the normal schema suite
explicitly verifies rejection rather than claiming full Thrift type coverage.

## Limits and release status

The suite supplies `i64Mode` explicitly when invoking generated factories. This
isolates wire conformance from the known factory-mode propagation defect. Binary
runtime values are Uint8Array; the existing generated string declarations are
still a release blocker. These tests do not establish correct TypeScript public
types, live-browser behavior, Angular integration, or production-server acceptance.

On 2026-09-27 the current Damsel HEAD was
`8d6174bddedc6d9aefa407fdc1d54877b8686ff9`. All nine cases passed against Apache
0.24.0. See [release audit](release-audit.md) for remaining implementation defects.
