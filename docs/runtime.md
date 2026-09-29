# Binary Protocol runtime

Metadata clients use this runtime for serialization. The low-level entry is also
available independently of metadata clients; it is not an Apache protocol object.
See [architecture](architecture.md) for the client contract.

Import from `@vality/tsthrift/runtime` after building the package. This entry has no Node,
parser, Apache, Angular, or RxJS imports. The implementation uses Uint8Array,
DataView, TextEncoder, and TextDecoder. Use ES2020 or newer for bigint support.

```ts
import { BinaryReader, BinaryWriter, MessageType, WireType } from "@vality/tsthrift/runtime";

const writer = new BinaryWriter();
writer.writeMessageBegin("next", MessageType.Call, 1);
writer.writeFieldBegin(WireType.I64, 1);
writer.writeI64(9223372036854775807n);
writer.writeFieldStop();

const reader = new BinaryReader(writer.finish());
const message = reader.readMessageBegin();
const field = reader.readFieldBegin();
const id = reader.readI64();
reader.readFieldBegin(); // STOP
reader.assertDone();
```

This is a low-level API, not a generated client. Callers must validate expected
message names/types/sequence IDs, field types, required fields, and exceptions.
The runtime client performs these checks through `MetadataCodecs` constructed from metadata.

## Values and structure

- `writeBool`/`readBool`, `writeByte`/`readByte`, `writeI16`/`readI16`,
  `writeI32`/`readI32`, `writeDouble`/`readDouble` handle scalar values.
- `writeI64`/`readI64` preserve the full signed 64-bit range as bigint.
- `writeI64Number`/`readI64Number` reject values outside the safe integer range.
  Standalone `numberToI64` and `i64ToNumber` provide the same checked conversion.
- `writeString`/`readString` use UTF-8, with platform replacement behavior for
  malformed Unicode. `writeBinary`/`readBinary` use raw Uint8Array bytes.
- Structs have no opening bytes. Write field headers with `writeFieldBegin(type,
id)` and terminate each struct with `writeFieldStop()`. `readFieldBegin()` returns
  `{ type, id }`; STOP returns `{ type: 0, id: 0 }`.
- `writeMapBegin`/`readMapBegin` handle map key type, value type, and size.
  `writeCollectionBegin`/`readCollectionBegin` handle the shared list/set header.
  Collection elements follow the header directly; there are no closing bytes.
- `skip(type)` consumes unknown values recursively, including nested maps, lists,
  sets, structs, and fixed-width UUID values. Native `writeUuid` and `readUuid` handle 16-byte fixed-width UUIDs (WireType 16).

Native generated `binary` models use Uint8Array, while legacy model declarations used
string; existing binary consumers require acceptance testing.
Empty structs have a STOP byte; deciding whether an optional struct is absent
belongs to the metadata codec, which preserves explicitly present `{}`.

## Envelopes and resource limits

Messages are unframed and big-endian. The writer emits strict version-1 headers.
The reader requires them by default; set `strictRead: false` to accept the legacy
unversioned format. It validates message type and version but not request/response
correlation. HTTP framing is not implemented.

`new BinaryWriter(maxBytes?)` caps output at 16 MiB by default. The writer grows
its buffer as needed and `finish()` returns a copy of bytes written so far.
Discard the writer after a failed write; multi-part operations are not transactional.

`new BinaryReader(bytes, options?)` accepts one complete message and respects input
view offsets. The defaults are:

| Option              | Default   | Meaning                                 |
| ------------------- | --------- | --------------------------------------- |
| `maxBytes`          | 16 MiB    | Maximum input byte length               |
| `maxCollectionSize` | 1,000,000 | Maximum entries in each collection      |
| `maxSkipDepth`      | 64        | Maximum value nesting traversed by skip |
| `strictRead`        | true      | Require versioned message envelopes     |

Negative sizes, unknown value types, truncation, and exceeded limits throw errors.
`remaining` reports unread bytes; call `assertDone()` when a complete message has
been decoded to reject trailing data. Do not continue decoding after an error.
The reader borrows the input array; do not mutate it while decoding. Returned
binary values are copies. `maxSkipDepth` only protects unknown-value traversal,
not arbitrary callers that recursively read known fields.

## Verification

`tests/binary-compatibility.test.ts` compares bytes and cross-decodes with pinned
Apache `thrift@0.24.0` through a test-only subprocess. No external compiler is
required. `tests/binary-validation.test.ts` covers invalid data and numeric bounds.
Native integration tests additionally execute generated clients with Apache wire
codecs, real local HTTP, and a browser-targeted bundle in an isolated JS context.
Live browser and application acceptance remain separate.

Wire reference: [Apache Binary Protocol specification](https://github.com/apache/thrift/blob/v0.24.0/doc/specs/thrift-binary-protocol.md).
