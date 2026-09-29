# @vality/tsthrift

Pure TypeScript Thrift Binary Protocol runtime, dynamic metadata RPC clients, and HTTP transport for browsers and modern JavaScript/TypeScript runtimes.

`@vality/tsthrift` provides client execution directly from schema metadata without requiring an Apache Thrift compiler, Node.js runtime globals, or `Buffer` polyfills.

## Features

- **Metadata-driven runtime:** Create dynamic RPC clients with `createMetadataClient` using schema metadata arrays, loader functions, or pre-built `MetadataIndex` snapshots.
- **Pure TypeScript Binary Protocol:** Native `BinaryReader` and `BinaryWriter` implementing Thrift Binary Protocol over `Uint8Array`.
- **Zero Node/Buffer dependencies:** Runs in browsers, web workers, Node.js, and edge runtimes.
- **Configurable `i64` precision:** Support for exact `bigint` (default) or safe `number` mode.
- **Native JavaScript values:** Plain objects for structs/unions/exceptions, `Map` (with support for struct keys), `Set`, arrays, and `Uint8Array` for binary data.
- **Production HTTP transport:** Fetch-based transport with configurable timeouts, request cancellation (`AbortSignal`), custom headers, and Woody distributed tracing headers.
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
not a runtime constructor. Direct RPC clients reject declared exceptions as tagged
plain payloads. `normalizeThriftError`, `catchServiceError`, and `toThriftResult`
wrap these as `ThriftServiceError`; `isThriftServiceError` only matches wrappers.

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
  const handledService = catchServiceError(err, "PaymentNotFound", (serviceErr) => {
    console.warn("Payment not found:", serviceErr.data);
    return true;
  });

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
| `woody`     | `boolean \| WoodyHeadersConfig`               | Enables automatic Woody distributed tracing headers generation. |
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

## Woody Tracing

The package includes built-in support for Woody tracing headers (`x-woody-trace-id`, `x-woody-span-id`, `x-woody-parent-id`):

```ts
import { createWoodyHeaderProvider, generateTraceId } from "@vality/tsthrift";

const client = await createMetadataClient({
  endpoint: "/rpc",
  namespace: "example",
  serviceName: "Example",
  metadata,
  woody: true, // auto-generates unique trace and span IDs per request
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
