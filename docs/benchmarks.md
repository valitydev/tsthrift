# Benchmarks

Two scripts measure the runtime and the cost of starting from IDL. Neither is part of `ready` or CI.
Results depend on the machine, Node.js version, and load; use them for ratios and order of
magnitude, and rerun on the target environment.

```sh
vp run bench           # calls: tsthrift metadata client vs Apache thrift
vp run bench:startup   # start-up: on the fly vs precompiled metadata vs CLI build
```

Measured on 2026-10-27: Apple M1 Pro (8 cores, 16 GiB), macOS 27.0, Node.js 24.22.1, `thrift` 0.25.0,
single run. `i64: "number"`, `binary: "uint8array"`.

## Calls: tsthrift vs Apache thrift

Each case is one full call: encode the request, then decode the reply. Values are identical on both
sides, and the script first requires byte-identical requests and equal decoded replies. Median of 7
rounds of 300 ms.

| Case                          | tsthrift calls/s | tsthrift, no call site | Apache calls/s | tsthrift / Apache | no call site / Apache |
| ----------------------------- | ---------------- | ---------------------- | -------------- | ----------------- | --------------------- |
| Ping (tiny message)           | 218.4k           | 584.4k                 | 509.7k         | 0.43x             | 1.15x                 |
| Put 10 items (encode-heavy)   | 71.1k            | 89.8k                  | 21.2k          | 3.36x             | 4.24x                 |
| Put 1000 items (encode-heavy) | 1.3k             | 1.3k                   | 201            | 6.24x             | 6.25x                 |
| Get 10 items (decode-heavy)   | 56.3k            | 68.9k                  | 65.5k          | 0.86x             | 1.05x                 |
| Get 1000 items (decode-heavy) | 814              | 816                    | 766            | 1.06x             | 1.07x                 |

"No call site" sets `Error.stackTraceLimit = 0` during the measurement. The client creates an `Error`
per call so that errors can report the caller; V8 then skips the stack walk, which approximates a
client without that feature. Apache captures nothing. Creating an `Error` costs about 3–4 µs with
the default limit of 10 frames and about 0.4 µs at limit 0 (Node.js 24.22.1, M1 Pro), so the
difference matters only for in-process calls with no network latency.

An item is a struct with `i64`, `string`, optional `double`, `list<i32>`, `map<string, string>`,
64 bytes of `binary`, and `bool` fields.

What the comparison does not equalize:

- The Apache side is hand-written Binary Protocol code, because no Thrift compiler is used here. It
  is the work generated Apache code performs, without its class wrappers.
- The tsthrift decoder also validates required fields, duplicate fields, and unions. The Apache
  reference code does not.
- The tsthrift client is asynchronous and captures a call site for error stacks (see "no call
  site" above); the Apache side is synchronous.
- Neither side uses a network: both run over a byte stub, not HTTP.
- Strings: all benchmark strings are ASCII. tsthrift writes ASCII strings of up to 64 characters
  and reads ASCII strings of up to 64 bytes in JavaScript; other strings use `TextEncoder` and
  `TextDecoder`, as required by the Web Standards First contract. Non-ASCII text is not measured
  here. Apache uses Node's `Buffer`.
- tsthrift returns `number` for `i64` and copies `binary`; Apache returns `Int64` and `Buffer` slices.

## Start-up: from IDL to a working client

Synthetic IDL: each module includes its predecessor, and every struct references the previous
struct, an enum, a typedef, containers, and an exception.

| Size   | Modules | Structs | Methods | IDL     | Metadata JSON |
| ------ | ------- | ------- | ------- | ------- | ------------- |
| small  | 1       | 5       | 4       | 1 KiB   | 4 KiB         |
| medium | 5       | 100     | 100     | 31 KiB  | 79 KiB        |
| large  | 20      | 1000    | 1200    | 333 KiB | 830 KiB       |

Cold is the median of 7 fresh Node.js processes, so JIT warm-up is included, as for the first
compile on a page. Warm is the median of repeated runs in one process. Milliseconds; the first call
uses a stub transport, so network time is excluded.

| Route and step                        | small cold | medium cold | large cold | large warm |
| ------------------------------------- | ---------- | ----------- | ---------- | ---------- |
| On the fly: `compileSources`          | 2.7        | 13.6        | 75.2       | 58.0       |
| On the fly: `createMetadataClient`    | 0.9        | 2.5         | 12.7       | 10.1       |
| On the fly: first call                | 0.5        | 0.5         | 0.6        | 0.1        |
| **On the fly: total**                 | **4.2**    | **16.6**    | **88.7**   | **67.4**   |
| On the fly: compile + emit TypeScript | 3.6        | 16.1        | 86.2       | 61.8       |
| Precompiled `metadata.json`: total    | 1.6        | 3.7         | 18.3       | 12.8       |

| CLI build (warm, median of 3) | small | medium | large |
| ----------------------------- | ----- | ------ | ----- |
| `generate`                    | 3.9   | 19.9   | 108   |
| `generate --bundle`           | 25.2  | 113    | 988   |

Compiling the IDL is about 85% of the on-the-fly total at the large size. Emitting TypeScript adds
3–11% to compilation. Precompiled metadata starts 4–5 times faster than compiling on the fly.

## Options

`vp run bench`: `BENCH_CASE` (case name substring), `BENCH_ONLY` (`tsthrift` or `apache`, for
profiling one side), `BENCH_SIZES` (default `10,1000`), `BENCH_ROUNDS` (7), `BENCH_ROUND_MS` (300).

`vp run bench:startup`: `BENCH_COLD_RUNS` (7), `BENCH_BUILD_RUNS` (3).
