# @vality/tsthrift

Pure TypeScript Thrift Binary Protocol runtime, dynamic metadata RPC clients, and HTTP transport for browsers and modern JavaScript/TypeScript runtimes.

`@vality/tsthrift` provides client execution directly from schema metadata without requiring an Apache Thrift compiler, Node.js runtime globals, or `Buffer` polyfills.

## Features

- **Metadata-driven runtime:** Create dynamic RPC clients with `createMetadataClient` using schema metadata arrays, loader functions, or pre-built `MetadataIndex` snapshots.
- **Pure TypeScript Binary Protocol:** Native `BinaryReader` and `BinaryWriter` implementing Thrift Binary Protocol over `Uint8Array`.
- **Zero Node/Buffer dependencies:** Runs in browsers, web workers, Node.js, and edge runtimes.
- **Configurable `i64` precision:** Support for exact `bigint` (default) or safe `number` mode.
- **Native JavaScript values:** Plain objects for structs/unions/exceptions, `Map` (with support for struct keys), `Set`, arrays, and `Uint8Array` for binary data.
- **HTTP transport:** Fetch-based transport with configurable timeouts, request cancellation (`AbortSignal`), custom headers, and Woody distributed tracing headers.
- **Typed error handling:** Clear distinction between transport/system failures (`ThriftSystemError`) and declared Thrift IDL exceptions (`ThriftServiceError`).
- **Safe call semantics:** Support for `ThriftResult<TData, TError>` pattern alongside throwing clients.

## Installation

```sh
npm install @vality/tsthrift
# or
pnpm add @vality/tsthrift
```

## Quick Start

### Dynamic client from metadata

```ts
import { createMetadataClient } from "@vality/tsthrift";

// metadata can be an array, Promise, or loader function
const client = await createMetadataClient({
  metadata, // or pre-built index: metadataIndex
  namespace: "payment_processing",
  serviceName: "PaymentProcessing",
  endpoint: "/rpc/payment",
  i64Mode: "bigint", // "bigint" (default) or "number"
  timeoutMs: 15_000,
});

// Invoke methods
const result = await client.getPayment(123456789n);
```

### Metadata selection

`createMetadataLoader` returns a loader accepting a required namespace name or readonly list
of names. List calls combine dependency closures into one `Metadata[]`, deduplicated by module
name in selection/dependency order. An empty list returns `[]`; unknown names reject the call.
Allowed names are inferred from the dependency keys. Loads are cached per namespace, and rejected
loads can be retried. For the `metadata` option of `createMetadataClient`, select a known namespace
in a zero-argument callback: `metadata: () => loadThriftMetadataByNamespaces("payment")`.

Generated package roots export `loadThriftMetadataByNamespaces`; pass their `THRIFT_NAMESPACES`
list to load all namespaces. Namespace subpaths export zero-argument `loadThriftMetadata()`.

### Typed client with generated descriptors

When schemas are compiled using `@vality/tsthrift-cli`, service definitions provide typed client factories and descriptors:

```ts
import { createPaymentProcessing } from "./generated/payment_processing/index.js";

const client = createPaymentProcessing({
  endpoint: "https://api.example.com/rpc/payment",
  headers: {
    Authorization: "Bearer token",
  },
  timeoutMs: 10_000,
});

const payment = await client.getPayment(123456789n, {
  headers: { "X-Request-Id": "req-123" },
});
```

### Non-throwing calls (`toThriftResult`)

Wrap any call in `toThriftResult` to receive a `{ data, error }` object instead of throwing:

```ts
import { toThriftResult } from "@vality/tsthrift";

const { data, error } = await toThriftResult(client.getPayment(123456789n));

if (error) {
  console.error("Call failed:", error);
} else {
  console.log("Payment:", data);
}
```

## Error Handling

`ThriftSystemError` is a TypeScript union of the system error classes below,
not a runtime constructor. Direct RPC clients reject declared exceptions as
`ThriftServiceError` with a qualified `module.Exception` type and original payload
in `data`. Error guards work across copies of the runtime.

```
ThriftError (base class)
├── ThriftSystemError
│   ├── ThriftHttpError         // Non-200 HTTP status
│   ├── ThriftTimeoutError      // Request timeout
│   ├── ThriftConnectionError   // Network or socket failure
│   ├── ThriftProtocolError     // Wire format or decoding violation
│   └── ThriftApplicationError  // TApplicationException returned by server
└── ThriftServiceError          // Declared IDL service exception
```

### Distinguishing system errors and service errors

```ts
import {
  catchServiceError,
  catchSystemError,
  isThriftServiceError,
  isThriftSystemError,
} from "@vality/tsthrift";

try {
  await client.createPayment(params);
} catch (err) {
  // Handle declared Thrift service exceptions
  const handledService = catchServiceError(
    err,
    "payment_processing.PaymentNotFound",
    (serviceErr) => {
      console.warn("Payment not found:", serviceErr.data);
      return true;
    },
  );

  if (handledService) return;

  // Handle system and transport failures
  catchSystemError(err, (systemErr) => {
    console.error("System or network failure:", systemErr.message);
  });
}
```

## Configuration

`HttpTransportConfig` options:

| Option      | Type                                          | Description                                                     |
| ----------- | --------------------------------------------- | --------------------------------------------------------------- |
| `endpoint`  | `string \| (() => string \| Promise<string>)` | Target endpoint URL or sync/async URL factory.                  |
| `headers`   | `HeaderProvider`                              | Static header object or async factory receiving base headers.   |
| `timeoutMs` | `number`                                      | Request timeout in milliseconds (default: `60_000`).            |
| `fetch`     | `typeof fetch`                                | Custom fetch implementation or framework bridge.                |
| `loggingFn` | `(params: ThriftLogParams) => void`           | Lifecycle logging callback for call, success, and error events. |

### Per-call options

Every service method accepts an optional trailing `RequestOptions` object:

```ts
const result = await client.process(data, {
  signal: abortController.signal,
  timeoutMs: 5_000,
  headers: { "X-Custom-Header": "value" },
});
```

## Woody & Wachter Headers

The package includes built-in helpers for Woody RPC tracing and Vality Wachter Gateway headers:

```ts
import { createWoodyHeaders, createWachterHeaders } from "@vality/tsthrift";

// Standalone Woody headers with customizable prefixes
const woodyHeaders = createWoodyHeaders({
  prefix: "x-woody-",
  meta: { "client-app": "admin-panel" },
});

// Compose both in client headers provider:
const client = await createMetadataClient({
  endpoint: "/rpc",
  namespace: "example",
  serviceName: "Example",
  metadata,
  headers: () => ({
    ...createWoodyHeaders(),
    ...createWachterHeaders({
      service: "Example",
      token: auth.getToken(),
      user: { id: user.id, email: user.email },
    }),
  }),
});
```

## Low-Level Runtime API (`@vality/tsthrift/runtime`)

For applications that need direct access to Binary Protocol serialization or wire types:

```ts
import {
  BinaryReader,
  BinaryWriter,
  MessageType,
  WireType,
  i64ToNumber,
  numberToI64,
} from "@vality/tsthrift/runtime";

// Writing
const writer = new BinaryWriter();
writer.writeMessageBegin("ping", MessageType.Call, 1);
writer.writeFieldBegin(WireType.String, 1);
writer.writeString("hello");
writer.writeFieldStop();
const bytes = writer.finish();

// Reading
const reader = new BinaryReader(bytes);
const header = reader.readMessageBegin(); // { name: "ping", type: MessageType.Call, sequenceId: 1 }
const field = reader.readFieldBegin(); // { type: WireType.String, id: 1 }
const value = reader.readString(); // "hello"
reader.readFieldBegin(); // Consume WireType.Stop; it has no value to skip.
reader.assertDone();
```

## License

Apache-2.0

## Runtime policy

Packages are ESM-only and use ES2023/Web APIs. Consumer declarations require TypeScript
5.1+ and `node16`, `nodenext`, or `bundler` resolution. No polyfills or automatic RPC
retries are included. `timeoutMs: 0` means an immediate timeout. Logging never receives
headers and only includes argument/result payloads when `logPayloads: true`; logger
failures are isolated. HTTP error details are capped at 1 KiB and excluded from `message`.
RPC errors and completion logs include service, method, sequence ID, and duration.
The built-in HTTP transport also captures the final `x-woody-trace-id` when present;
custom transports and header prefixes must provide their own trace correlation.

`generateId` produces backend-compatible 64-bit Flake IDs in the legacy base64 alphabet.
`generateId` uses a shared `FlakeId` with a random 10-bit generator id chosen per runtime
instance, so independent clients rarely collide; `new FlakeId()` keeps generator id 0 like `flake-idgen`.
`FlakeId.next()` never throws by default: after a clock rollback it keeps the last timestamp,
and after 4096 IDs in one millisecond it borrows the next one, so tracing never fails a call.
Output matches `flake-idgen` wherever upstream succeeds; `new FlakeId({ strict: true })`
reproduces its exceptions.
Woody deadlines are optional absolute times; use a `deadline` callback or header
provider to refresh them and account for client/server clock skew.
