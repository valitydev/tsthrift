# Damsel binary conformance

Run the independent generated-code comparison from the repository root:

```sh
vp install
vp run test:conformance
```

Prerequisites are Git, a Thrift compiler (e.g. `thrift` on PATH or `THRIFT_COMPILER`),
a JDK **17 or newer** with `java` and `javac` available on PATH, and Apache Maven (`mvn`).
Thrift Java runtime libraries and transitive dependencies are resolved automatically via Maven
(`packages/cli/tests/conformance/reference/pom.xml`) using `mvn dependency:build-classpath`
with configurable `LIBTHRIFT_VERSION` (`0.20.0` for Vality Thrift 0.20.1, `0.24.0` for Apache Thrift 0.24.0).
The task is deliberately uncached and fetches the revision committed in
`.github/damsel-revision` (currently tag `v2.2.47`); Renovate proposes newer `valitydev/damsel` tags there.
Normal `vp test` does not need Java, an external compiler, or these downloads.
Conformance runs in a dedicated two-variant matrix on GitHub Actions CI.

For explicit executable paths or retained artifacts, invoke the suite directly
after `vp run build`:

```sh
THRIFT_COMPILER=/path/to/thrift JAVA=/path/to/java JAVAC=/path/to/javac MVN=/path/to/mvn \
  KEEP_CONFORMANCE_OUTPUT=1 \
  vp -C packages/cli test --config conformance.config.ts --reporter=verbose
```

The verbose output identifies the exact Damsel commit and temporary directory.
`provenance.json`, generated Java/TypeScript, compiled code, and binary request and
reply files are preserved when `KEEP_CONFORMANCE_OUTPUT=1`; otherwise the directory
is removed after the run. Missing tools, dependency resolution errors, generation failures,
and mismatches fail the suite rather than skipping it.

## Independent reference

The suite compiles Java from unmodified Damsel IDL and the committed test IDL
using either the Vality Thrift compiler (v0.20.1) or official Apache Thrift (v0.24.0).
Classpath dependencies are resolved via a minimal Maven POM next to the Java reference runner
(`packages/cli/tests/conformance/reference/pom.xml`):

- `vality-0.20.1`: Vality compiler 0.20.1 with `libthrift` version `0.20.0` and `javax.annotation-api:1.3.2`
  (required for `@Generated` annotations emitted by the Vality compiler).
- `apache-0.24.0`: Official Apache compiler 0.24.0 with `libthrift` version `0.24.0` (invoked with
  `-gen java:generated_annotations=suppress` to avoid external annotation dependencies).

Maven resolves `libthrift`, `slf4j-api`, `javax.annotation-api`, and all transitive dependencies
directly to the local repository, eliminating manual jar searching and downloading heuristics.
Conformance reference runners (`Conformance.java`) dynamically bind to both Vality's `*Srv`
generated services and standard Apache `*` service classes. Unknown compiler versions are
rejected with fatal errors. No production dependency is added.

Java is used because its generated clients preserve struct and union map keys.
Stock Apache JavaScript generation uses object-backed maps and is unsuitable as
the sole reference for this contract. Neither generated Java nor upstream IDL is
patched. Test values are constructed independently in Java and TypeScript.

Each scenario compares the complete native request byte-for-byte with a generated
Java client's request. A generated `Processor` then decodes the native request and
checks the method and all arguments against the Java values. It produces a reply
which the native client decodes. Native metadata codecs also encode
successful/declared-exception reply objects for byte-for-byte comparison with the
generated Java reply.

Map and set insertion order is intentionally the same on both writers. Binary
Protocol has no canonical map/set ordering: equivalent values with different
iteration orders need not have identical bytes. Cross-decoding and object/key
counts are checked separately from byte equality.

## Environment configuration and CI matrix

The conformance runner honors the following environment variables:

- `THRIFT_COMPILER`: Path to the Thrift compiler binary. Defaults to `thrift` on PATH.
- `LIBTHRIFT_VERSION`: Exact `org.apache.thrift:libthrift` version (`0.20.0` or `0.24.0`).
  Passed from CI matrix; defaults automatically based on the detected compiler variant.
- `MVN`: Path to the Maven executable. Defaults to `mvn` on PATH.
- `DAMSEL_REVISION`: Specific Git commit SHA or ref to checkout. When set, performs a shallow
  fetch (`--depth 1`) of the exact commit. The default is `.github/damsel-revision`.
- `CONFORMANCE_OUTPUT_DIR`: Fixed directory for test output. When unset, a temporary directory
  under the system temporary directory (`os.tmpdir()`) is used.
- `KEEP_CONFORMANCE_OUTPUT`: If set to `1`, prevents cleanup of the output directory on success.
  If any test fails (`suiteFailed`), the output directory is always preserved regardless of this flag.
- `THRIFT_CLASSPATH`: Optional explicit Java classpath. Must contain matching variant jars and validate before compilation.

CI runs both variants in a matrix (`vality-0.20.1` and `apache-0.24.0`) on GitHub Actions
with Maven caching (`actions/cache@v6` on `~/.m2/repository`) and automated artifact upload on
failure or completion (`actions/upload-artifact@v7`).
The Apache compiler is built from the exact release tag selected by the matrix;
both jobs verify the compiler version before running tests.

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

The eleven conformance cases include both numeric modes and populated/empty value
variants. Native UUID operates with 16-byte binary wire encoding (WireType 16)
and canonical hyphenated UUID strings.

## Limits and verification status

The conformance setup explicitly selects `--binary uint8array`; generated models and runtime values use `Uint8Array` for binary data and bind the selected `i64Mode` into generated factories. Conformance tests verify serialization fidelity, processor argument decoding, and reply roundtrips against Java reference implementations. These tests focus on wire and protocol conformance, leaving production server deployment and end-to-end frontend integration to downstream consumer verification.

Both compiler/runtime pairs must pass on the exact release candidate. Earlier runs
and support in `setup.ts` do not establish acceptance of later changes.
