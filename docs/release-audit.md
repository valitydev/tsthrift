# Release readiness audit

Date: 2026-09-28. Scope: metadata runtime, generated protocol packages, and Angular adapter.
This supersedes the 2026-09-27 audit. Release fixes are implemented locally;
publication and application migration are separate acceptance steps.

## Resolved defects

| Area                | Defect and resulting behavior                                                                                                                                                    | Verification                                                                                                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generated factories | Number-mode models used bigint codecs. Factories now bind the emitted mode, reject conflicting typed configuration, and preserve default metadata when an override is undefined. | Both modes execute root exports and registry descriptors against Apache wire codecs and real HTTP. Installed bundled factories also execute.                                      |
| Binary              | Models/constants declared strings while codecs required bytes. Generated binary values now use Uint8Array throughout.                                                            | Executed constants, type checking, wire tests, installed artifacts.                                                                                                               |
| Angular HTTP        | Typed arrays were passed to HttpClient, whose binary body contract uses ArrayBuffer. Abort listeners leaked and backend HTTP errors lost their status.                           | Real HttpClient with its testing backend verifies serialized bytes, error body/status, and timeout teardown; adapter tests cover empty completion/network failures.               |
| Observable adapter  | Payload fields named headers/signal/timeoutMs could be mistaken for request options; ordinary data fields could be unwrapped as results.                                         | Metadata methods carry their IDL argument count; tests exercise eager/lazy methods, options, safe calls, ordinary data fields, and cancellation before metadata loads.            |
| Angular DI          | Bulk registration discarded token-specific endpoint/header overrides.                                                                                                            | Both individual and bulk registration use the same provider implementation.                                                                                                       |
| HTTP lifecycle      | Header providers ran outside timeout/cancellation; header overrides were case-sensitive.                                                                                         | Stalled preparation, late resolution, pre-aborted calls, ignored fetch signals, and mixed-case overrides are tested.                                                              |
| HTTP response       | Body buffering was unbounded before decoding; MIME validation accepted substring matches.                                                                                        | Streamed fetch responses are capped at 16 MiB and overflow cancels the stream. Media types are parsed exactly. Angular's backend still owns its prior body buffering.             |
| Schema/output       | Invalid defaults, oneway signatures, implicit field IDs, reserved methods, and generated identifier/path collisions could survive generation.                                    | Rejected before output replacement; rollback tests preserve previous artifacts. Unsupported output identifiers are rejected explicitly.                                           |
| Output safety       | Regeneration could erase unrelated directories.                                                                                                                                  | Ownership manifests, symlink checks, canonical path overlap checks, and refusal of extra handwritten files protect output directories.                                            |
| Bundling            | CLI depended on a global command or an implicit npx download and could load the consumer's build config.                                                                         | Optional local Vite+/TypeScript peers; direct Pack API with explicit entries and no config/export mutation. Installed CLI builds and regenerates an installable protocol tarball. |
| Binary conversion   | Malformed hex pairs could decode partially.                                                                                                                                      | Full-input validation and malformed-pair regressions.                                                                                                                             |
| Conformance         | Large Damsel scenarios still imported pre-refactor output paths.                                                                                                                 | All eleven scenarios execute against each Java reference.                                                                                                                         |
| Distribution        | Package examples had wrong CLI/subpath/build instructions.                                                                                                                       | READMEs and package SPDX metadata are published; the adapted Flake ID source carries its full MIT notice in a preserved legal comment.                                            |
| Release workflow    | Publication was independent of CI and conformance.                                                                                                                               | Release now follows successful push CI for the current main SHA; CI includes artifact and browser acceptance. Hosted execution remains unverified locally.                        |

The Angular HTTP behavior follows the [HttpClient request/error/cancellation contracts](https://angular.dev/guide/http/making-requests).
The release action uses the [Changesets v2 inputs](https://github.com/changesets/action/blob/v2/action.yml).

## Reproducible checks

```sh
vp install
vp check
vp run build
vp test
vp run test:packages
vp exec playwright install chromium
vp run test:browser
DAMSEL_REVISION=8d6174bddedc6d9aefa407fdc1d54877b8686ff9 vp run test:conformance
```

- `vp check`, build, and `git diff --check` pass. The fast suite passes 197 tests across
  27 files, including generated source compilation/execution and isolated browser bundles,
  malformed wire data, HTTP sockets, metadata contracts, and Angular integration.
- Package smoke installs actual tarballs in a temporary consumer, checks ESM and Node
  require-of-ESM imports, CLI startup, declarations, root/subpath factories, metadata
  loading, binary constants, and repeated protocol bundling/installation. It also
  exercises Angular DI at the declared minimum (16.2.12) and current development version (22.2.0).
- Browser smoke runs Chromium against loopback Apache Binary Protocol HTTP, using both
  browser fetch and Angular XHR, both i64 modes, a generated factory, Angular DI/Observable
  calls, backend errors, timeout, and cancellation.
- Conformance uses Damsel `8d6174bddedc6d9aefa407fdc1d54877b8686ff9`, with eleven scenarios
  each for Apache compiler/runtime 0.24.0 and Vality compiler 0.20.1 / Java runtime 0.20.0.
  Set `THRIFT_COMPILER`, `JAVA`, and `JAVAC` as needed; see [conformance](conformance.md).
- Local Node verification uses Node 24.21.0. The configured CI runtime is Node 22;
  successful hosted CI is required before publication. This is ESM output, not a separate CJS build.

## Remaining release gates

1. **Application acceptance for a legacy migration.** Generate a real protocol package,
   integrate it with control-center and @vality/ng-thrift, and verify optional/empty form
   values, auth refresh, service endpoints, lazy loading, error handling, and binary/i64
   migration. Fixtures, a browser smoke, and Java conformance do not establish this.
   The new DI/configuration API is not a drop-in ConnectOptions$ replacement.
2. **Hosted release validation.** Run the updated CI on the release revision and verify
   npm publishing credentials/trusted-publisher configuration for all three package names.
   The checked-in patch changeset prepares versioning; no package was published and no
   commit/tag was created during this audit.
3. **Choose the supported release scope.** An initial metadata-client release can document
   the following exclusions. A claim of complete legacy replacement or all-IDL support
   requires the corresponding implementation/consumer evidence first.

## Explicit scope limits

- Unsafe integral IDL literals are rejected because the pinned legacy parser represents
  them as numbers. Runtime bigint still preserves the complete signed i64 wire range.
  Exact large-integer IDL constants and UUID model generation remain unsupported.
- Generated names that conflict with TypeScript/helper identifiers are rejected rather
  than silently renamed. Existing unowned outputs must be moved aside before regeneration.
- Async metadata initialization itself is not governed by the HTTP timeout. Observable
  unsubscription before initialization prevents a subsequent request; an arbitrary loader
  owns its I/O lifetime. Direct byte transports likewise own cancellation/timeouts.
- Angular HttpClient buffers responses before the fetch bridge sees them. Its backend or
  interceptors must enforce network allocation limits if required.
- Chromium and Angular 16/22 checks are targeted acceptance tests, not a comprehensive
  cross-browser or every-Angular-version matrix. No deployed production server was called.
