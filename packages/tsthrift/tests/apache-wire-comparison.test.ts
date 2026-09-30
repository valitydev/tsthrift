import { createRequire } from "node:module";
import { describe, expect, test } from "vite-plus/test";
import {
  BinaryReader,
  BinaryWriter,
  MessageType,
  type Metadata,
  WireType,
  createMetadataClient,
} from "../src/index.ts";

const require = createRequire(import.meta.url);
const { TBinaryProtocol, TBufferedTransport, fromBigInt, toBigInt } = require("thrift") as {
  TBinaryProtocol: any;
  TBufferedTransport: any;
  fromBigInt: (val: bigint) => any;
  toBigInt: (val: any) => bigint;
};

/** Helper to encode bytes using Apache Thrift 0.24 TBinaryProtocol */
function encodeWithApache(fn: (proto: any) => void): Uint8Array {
  let output = new Uint8Array();
  const transport = new TBufferedTransport(undefined, (bytes: Buffer) => {
    output = new Uint8Array(bytes);
  });
  const protocol = new TBinaryProtocol(transport);
  fn(protocol);
  transport.flush();
  return output;
}

/** Helper to decode bytes using Apache Thrift 0.24 TBinaryProtocol */
function decodeWithApache<T>(bytes: Uint8Array, fn: (proto: any) => T): T {
  let result!: T;
  TBufferedTransport.receiver((transport: any) => {
    const protocol = new TBinaryProtocol(transport);
    result = fn(protocol);
  })(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  return result;
}

describe("Apache Thrift 0.24 Wire Protocol Comparison & Verification", () => {
  describe("Byte-for-byte exact equality (Our BinaryWriter == Apache TBinaryProtocol)", () => {
    test("deeply nested structs match byte-for-byte", () => {
      // Level 1 -> Level 2 -> Level 3 struct
      const ourWriter = new BinaryWriter();
      ourWriter.writeFieldBegin(WireType.Struct, 1);
      ourWriter.writeFieldBegin(WireType.String, 1);
      ourWriter.writeString("root");
      ourWriter.writeFieldBegin(WireType.Struct, 2);
      ourWriter.writeFieldBegin(WireType.I32, 1);
      ourWriter.writeI32(100);
      ourWriter.writeFieldBegin(WireType.Struct, 2);
      ourWriter.writeFieldBegin(WireType.Bool, 1);
      ourWriter.writeBool(true);
      ourWriter.writeFieldBegin(WireType.I64, 2);
      ourWriter.writeI64(9876543210123456n);
      ourWriter.writeFieldStop();
      ourWriter.writeFieldStop();
      ourWriter.writeFieldStop();
      ourWriter.writeFieldStop();
      const ourBytes = ourWriter.finish();

      const apacheBytes = encodeWithApache((proto) => {
        proto.writeFieldBegin("level1", 12, 1);
        proto.writeFieldBegin("name", 11, 1);
        proto.writeString("root");
        proto.writeFieldBegin("level2", 12, 2);
        proto.writeFieldBegin("count", 8, 1);
        proto.writeI32(100);
        proto.writeFieldBegin("level3", 12, 2);
        proto.writeFieldBegin("flag", 2, 1);
        proto.writeBool(true);
        proto.writeFieldBegin("large", 10, 2);
        proto.writeI64(fromBigInt(9876543210123456n));
        proto.writeFieldStop();
        proto.writeFieldStop();
        proto.writeFieldStop();
        proto.writeFieldStop();
      });

      expect(Buffer.from(ourBytes).toString("hex")).toBe(Buffer.from(apacheBytes).toString("hex"));
    });

    test("maps with struct keys match byte-for-byte", () => {
      const ourWriter = new BinaryWriter();
      ourWriter.writeFieldBegin(WireType.Map, 1);
      ourWriter.writeMapBegin(WireType.Struct, WireType.Struct, 2);
      // Entry 1
      ourWriter.writeFieldBegin(WireType.I32, 1);
      ourWriter.writeI32(1);
      ourWriter.writeFieldBegin(WireType.String, 2);
      ourWriter.writeString("key1");
      ourWriter.writeFieldStop();
      ourWriter.writeFieldBegin(WireType.Bool, 1);
      ourWriter.writeBool(true);
      ourWriter.writeFieldStop();
      // Entry 2
      ourWriter.writeFieldBegin(WireType.I32, 1);
      ourWriter.writeI32(2);
      ourWriter.writeFieldBegin(WireType.String, 2);
      ourWriter.writeString("key2");
      ourWriter.writeFieldStop();
      ourWriter.writeFieldBegin(WireType.Bool, 1);
      ourWriter.writeBool(false);
      ourWriter.writeFieldStop();
      ourWriter.writeFieldStop();
      const ourBytes = ourWriter.finish();

      const apacheBytes = encodeWithApache((proto) => {
        proto.writeFieldBegin("structMap", 13, 1);
        proto.writeMapBegin(12, 12, 2);
        // Entry 1
        proto.writeFieldBegin("id", 8, 1);
        proto.writeI32(1);
        proto.writeFieldBegin("name", 11, 2);
        proto.writeString("key1");
        proto.writeFieldStop();
        proto.writeFieldBegin("val", 2, 1);
        proto.writeBool(true);
        proto.writeFieldStop();
        // Entry 2
        proto.writeFieldBegin("id", 8, 1);
        proto.writeI32(2);
        proto.writeFieldBegin("name", 11, 2);
        proto.writeString("key2");
        proto.writeFieldStop();
        proto.writeFieldBegin("val", 2, 1);
        proto.writeBool(false);
        proto.writeFieldStop();
        proto.writeFieldStop();
      });

      expect(Buffer.from(ourBytes).toString("hex")).toBe(Buffer.from(apacheBytes).toString("hex"));
    });

    test("nested collections (Map of string to List of structs) match byte-for-byte", () => {
      const ourWriter = new BinaryWriter();
      ourWriter.writeFieldBegin(WireType.Map, 5);
      ourWriter.writeMapBegin(WireType.String, WireType.List, 1);
      ourWriter.writeString("group-a");
      ourWriter.writeCollectionBegin(WireType.Struct, 2);
      // List Item 1
      ourWriter.writeFieldBegin(WireType.I16, 1);
      ourWriter.writeI16(10);
      ourWriter.writeFieldStop();
      // List Item 2
      ourWriter.writeFieldBegin(WireType.I16, 1);
      ourWriter.writeI16(20);
      ourWriter.writeFieldStop();
      ourWriter.writeFieldStop();
      const ourBytes = ourWriter.finish();

      const apacheBytes = encodeWithApache((proto) => {
        proto.writeFieldBegin("nestedCol", 13, 5);
        proto.writeMapBegin(11, 15, 1);
        proto.writeString("group-a");
        proto.writeListBegin(12, 2);
        proto.writeFieldBegin("num", 6, 1);
        proto.writeI16(10);
        proto.writeFieldStop();
        proto.writeFieldBegin("num", 6, 1);
        proto.writeI16(20);
        proto.writeFieldStop();
        proto.writeFieldStop();
      });

      expect(Buffer.from(ourBytes).toString("hex")).toBe(Buffer.from(apacheBytes).toString("hex"));
    });

    test("binary payloads (Uint8Array) of various sizes match byte-for-byte", () => {
      const emptyBin = new Uint8Array(0);
      const smallBin = new Uint8Array([0x00, 0x01, 0x02, 0xff, 0xfe]);
      const fullRangeBin = new Uint8Array(256);
      for (let i = 0; i < 256; i++) fullRangeBin[i] = i;

      const ourWriter = new BinaryWriter();
      ourWriter.writeFieldBegin(WireType.String, 1);
      ourWriter.writeBinary(emptyBin);
      ourWriter.writeFieldBegin(WireType.String, 2);
      ourWriter.writeBinary(smallBin);
      ourWriter.writeFieldBegin(WireType.String, 3);
      ourWriter.writeBinary(fullRangeBin);
      ourWriter.writeFieldStop();
      const ourBytes = ourWriter.finish();

      const apacheBytes = encodeWithApache((proto) => {
        proto.writeFieldBegin("empty", 11, 1);
        proto.writeBinary(Buffer.from(emptyBin));
        proto.writeFieldBegin("small", 11, 2);
        proto.writeBinary(Buffer.from(smallBin));
        proto.writeFieldBegin("full", 11, 3);
        proto.writeBinary(Buffer.from(fullRangeBin));
        proto.writeFieldStop();
      });

      expect(Buffer.from(ourBytes).toString("hex")).toBe(Buffer.from(apacheBytes).toString("hex"));
    });

    test("UTF-8 strings with multi-byte emojis, Cyrillic, and escape characters match byte-for-byte", () => {
      const complexStrings = [
        "Hello, World!",
        "Привет, мир! 🚀 🌟 ⚡",
        'Line 1\nLine 2\tTabbed "Quoted" \\Backslash\\',
        "CJK: 漢字 日本語 한국어",
        "",
      ];

      const ourWriter = new BinaryWriter();
      ourWriter.writeCollectionBegin(WireType.String, complexStrings.length);
      for (const s of complexStrings) ourWriter.writeString(s);
      const ourBytes = ourWriter.finish();

      const apacheBytes = encodeWithApache((proto) => {
        proto.writeListBegin(11, complexStrings.length);
        for (const s of complexStrings) proto.writeString(s);
      });

      expect(Buffer.from(ourBytes).toString("hex")).toBe(Buffer.from(apacheBytes).toString("hex"));
    });

    test("full-range signed 64-bit integers match byte-for-byte", () => {
      const i64Values = [
        -(1n << 63n),
        -(1n << 63n) + 1n,
        -9007199254740991n,
        -2147483648n,
        -1n,
        0n,
        1n,
        2147483647n,
        9007199254740991n,
        (1n << 63n) - 2n,
        (1n << 63n) - 1n,
      ];

      const ourWriter = new BinaryWriter();
      ourWriter.writeCollectionBegin(WireType.I64, i64Values.length);
      for (const v of i64Values) ourWriter.writeI64(v);
      const ourBytes = ourWriter.finish();

      const apacheBytes = encodeWithApache((proto) => {
        proto.writeListBegin(10, i64Values.length);
        for (const v of i64Values) proto.writeI64(fromBigInt(v));
      });

      expect(Buffer.from(ourBytes).toString("hex")).toBe(Buffer.from(apacheBytes).toString("hex"));
    });
  });

  describe("Bidirectional Cross-Decoding (We write -> Apache reads, Apache writes -> We read)", () => {
    test("Direction 1: our BinaryWriter writes complex nested struct -> Apache TBinaryProtocol decodes it", () => {
      const ourWriter = new BinaryWriter();
      ourWriter.writeFieldBegin(WireType.String, 1);
      ourWriter.writeString("Order#12345");
      ourWriter.writeFieldBegin(WireType.Struct, 2);
      ourWriter.writeFieldBegin(WireType.I32, 1);
      ourWriter.writeI32(42);
      ourWriter.writeFieldBegin(WireType.Double, 2);
      ourWriter.writeDouble(199.99);
      ourWriter.writeFieldBegin(WireType.String, 3);
      ourWriter.writeBinary(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
      ourWriter.writeFieldStop();
      ourWriter.writeFieldStop();
      const bytes = ourWriter.finish();

      const decoded = decodeWithApache(bytes, (proto) => {
        const f1 = proto.readFieldBegin();
        const str = proto.readString();
        const f2 = proto.readFieldBegin();
        const subF1 = proto.readFieldBegin();
        const num = proto.readI32();
        const subF2 = proto.readFieldBegin();
        const price = proto.readDouble();
        const subF3 = proto.readFieldBegin();
        const raw = [...proto.readBinary()];
        const subStop = proto.readFieldBegin();
        const mainStop = proto.readFieldBegin();
        return {
          f1: { id: f1.fid, type: f1.ftype, value: str },
          f2: { id: f2.fid, type: f2.ftype },
          sub: {
            num: { id: subF1.fid, value: num },
            price: { id: subF2.fid, value: price },
            raw: { id: subF3.fid, value: raw },
            subStop: subStop.ftype,
          },
          mainStop: mainStop.ftype,
        };
      });

      expect(decoded).toEqual({
        f1: { id: 1, type: 11, value: "Order#12345" },
        f2: { id: 2, type: 12 },
        sub: {
          num: { id: 1, value: 42 },
          price: { id: 2, value: 199.99 },
          raw: { id: 3, value: [0xde, 0xad, 0xbe, 0xef] },
          subStop: 0,
        },
        mainStop: 0,
      });
    });

    test("Direction 2: Apache TBinaryProtocol writes complex nested struct -> our BinaryReader decodes it", () => {
      const bytes = encodeWithApache((proto) => {
        proto.writeFieldBegin("name", 11, 1);
        proto.writeString("Account");
        proto.writeFieldBegin("details", 12, 2);
        proto.writeFieldBegin("balance", 10, 1);
        proto.writeI64(fromBigInt(100000000000n));
        proto.writeFieldBegin("active", 2, 2);
        proto.writeBool(true);
        proto.writeFieldStop();
        proto.writeFieldStop();
      });

      const reader = new BinaryReader(bytes);
      expect(reader.readFieldBegin()).toEqual({ id: 1, type: WireType.String });
      expect(reader.readString()).toBe("Account");
      expect(reader.readFieldBegin()).toEqual({ id: 2, type: WireType.Struct });
      expect(reader.readFieldBegin()).toEqual({ id: 1, type: WireType.I64 });
      expect(reader.readI64()).toBe(100000000000n);
      expect(reader.readFieldBegin()).toEqual({ id: 2, type: WireType.Bool });
      expect(reader.readBool()).toBe(true);
      expect(reader.readFieldBegin().type).toBe(WireType.Stop);
      expect(reader.readFieldBegin().type).toBe(WireType.Stop);
      reader.assertDone();
    });

    test("Direction 1 & 2: Map with struct keys and Set values round-tripped with Apache", () => {
      // 1. We write -> Apache reads
      const ourWriter = new BinaryWriter();
      ourWriter.writeMapBegin(WireType.Struct, WireType.Set, 1);
      // Key struct
      ourWriter.writeFieldBegin(WireType.String, 1);
      ourWriter.writeString("EUR");
      ourWriter.writeFieldStop();
      // Value Set
      ourWriter.writeCollectionBegin(WireType.I64, 2);
      ourWriter.writeI64(10n);
      ourWriter.writeI64(20n);
      const ourBytes = ourWriter.finish();

      const apacheReadResult = decodeWithApache(ourBytes, (proto) => {
        const mapHeader = proto.readMapBegin();
        proto.readFieldBegin();
        const curr = proto.readString();
        proto.readFieldBegin(); // stop
        proto.readSetBegin();
        const val1 = toBigInt(proto.readI64());
        const val2 = toBigInt(proto.readI64());
        return {
          mapHeader: { ktype: mapHeader.ktype, vtype: mapHeader.vtype, size: mapHeader.size },
          currency: curr,
          setValues: [val1, val2],
        };
      });

      expect(apacheReadResult).toEqual({
        mapHeader: { ktype: 12, vtype: 14, size: 1 },
        currency: "EUR",
        setValues: [10n, 20n],
      });

      // 2. Apache writes -> We read
      const apacheBytes = encodeWithApache((proto) => {
        proto.writeMapBegin(12, 14, 1);
        proto.writeFieldBegin("currency", 11, 1);
        proto.writeString("USD");
        proto.writeFieldStop();
        proto.writeSetBegin(10, 2);
        proto.writeI64(fromBigInt(100n));
        proto.writeI64(fromBigInt(200n));
      });

      const ourReader = new BinaryReader(apacheBytes);
      expect(ourReader.readMapBegin()).toEqual({
        keyType: WireType.Struct,
        valueType: WireType.Set,
        size: 1,
      });
      expect(ourReader.readFieldBegin()).toEqual({ id: 1, type: WireType.String });
      expect(ourReader.readString()).toBe("USD");
      expect(ourReader.readFieldBegin().type).toBe(WireType.Stop);
      expect(ourReader.readCollectionBegin()).toEqual({
        elementType: WireType.I64,
        size: 2,
      });
      expect(ourReader.readI64()).toBe(100n);
      expect(ourReader.readI64()).toBe(200n);
      ourReader.assertDone();
    });
  });

  describe("RPC Method Request & Response Envelopes with Apache 0.24", () => {
    test("RPC CALL message with complex arguments: we write, Apache validates header and arguments", () => {
      const ourWriter = new BinaryWriter();
      ourWriter.writeMessageBegin("processPayment", MessageType.Call, 42);
      // Argument 1: struct PaymentRequest (id: 1)
      ourWriter.writeFieldBegin(WireType.Struct, 1);
      ourWriter.writeFieldBegin(WireType.String, 1);
      ourWriter.writeString("pay-999");
      ourWriter.writeFieldBegin(WireType.I64, 2);
      ourWriter.writeI64(500000n);
      ourWriter.writeFieldStop();
      // Argument 2: binary idempotency token (id: 2)
      ourWriter.writeFieldBegin(WireType.String, 2);
      ourWriter.writeBinary(new Uint8Array([1, 2, 3, 4]));
      ourWriter.writeFieldStop();
      const callBytes = ourWriter.finish();

      const decoded = decodeWithApache(callBytes, (proto) => {
        const msg = proto.readMessageBegin();
        const arg1Field = proto.readFieldBegin();
        proto.readFieldBegin();
        const id = proto.readString();
        proto.readFieldBegin();
        const amount = toBigInt(proto.readI64());
        proto.readFieldBegin(); // struct stop
        const arg2Field = proto.readFieldBegin();
        const token = [...proto.readBinary()];
        proto.readFieldBegin(); // args stop
        proto.readMessageEnd();
        return {
          msg: { fname: msg.fname, mtype: msg.mtype, rseqid: msg.rseqid },
          arg1: { id: arg1Field.fid, value: { id, amount } },
          arg2: { id: arg2Field.fid, value: token },
        };
      });

      expect(decoded).toEqual({
        msg: { fname: "processPayment", mtype: 1, rseqid: 42 },
        arg1: { id: 1, value: { id: "pay-999", amount: 500000n } },
        arg2: { id: 2, value: [1, 2, 3, 4] },
      });
    });

    test("RPC REPLY success message: Apache writes reply, our BinaryReader reads it", () => {
      const replyBytes = encodeWithApache((proto) => {
        proto.writeMessageBegin("processPayment", 2, 42);
        // Field 0: Success result (struct PaymentResult)
        proto.writeFieldBegin("success", 12, 0);
        proto.writeFieldBegin("status", 11, 1);
        proto.writeString("COMPLETED");
        proto.writeFieldBegin("transactionId", 10, 2);
        proto.writeI64(fromBigInt(777888999n));
        proto.writeFieldStop();
        proto.writeFieldStop();
        proto.writeMessageEnd();
      });

      const reader = new BinaryReader(replyBytes);
      const header = reader.readMessageBegin();
      expect(header).toEqual({
        name: "processPayment",
        type: MessageType.Reply,
        sequenceId: 42,
      });

      expect(reader.readFieldBegin()).toEqual({ id: 0, type: WireType.Struct });
      expect(reader.readFieldBegin()).toEqual({ id: 1, type: WireType.String });
      expect(reader.readString()).toBe("COMPLETED");
      expect(reader.readFieldBegin()).toEqual({ id: 2, type: WireType.I64 });
      expect(reader.readI64()).toBe(777888999n);
      expect(reader.readFieldBegin().type).toBe(WireType.Stop);
      expect(reader.readFieldBegin().type).toBe(WireType.Stop);
      reader.assertDone();
    });

    test("RPC REPLY declared exception message: Apache writes exception, our BinaryReader reads it", () => {
      const exceptionBytes = encodeWithApache((proto) => {
        proto.writeMessageBegin("processPayment", 2, 42);
        // Field 1: Declared Exception (struct PaymentFailed)
        proto.writeFieldBegin("paymentFailed", 12, 1);
        proto.writeFieldBegin("errorCode", 8, 1);
        proto.writeI32(402);
        proto.writeFieldBegin("message", 11, 2);
        proto.writeString("Insufficient funds");
        proto.writeFieldStop();
        proto.writeFieldStop();
        proto.writeMessageEnd();
      });

      const reader = new BinaryReader(exceptionBytes);
      const header = reader.readMessageBegin();
      expect(header).toEqual({
        name: "processPayment",
        type: MessageType.Reply,
        sequenceId: 42,
      });

      expect(reader.readFieldBegin()).toEqual({ id: 1, type: WireType.Struct });
      expect(reader.readFieldBegin()).toEqual({ id: 1, type: WireType.I32 });
      expect(reader.readI32()).toBe(402);
      expect(reader.readFieldBegin()).toEqual({ id: 2, type: WireType.String });
      expect(reader.readString()).toBe("Insufficient funds");
      expect(reader.readFieldBegin().type).toBe(WireType.Stop);
      expect(reader.readFieldBegin().type).toBe(WireType.Stop);
      reader.assertDone();
    });

    test("RPC ONEWAY message: our BinaryWriter writes oneway, Apache verifies message type", () => {
      const ourWriter = new BinaryWriter();
      ourWriter.writeMessageBegin("notifyEvent", MessageType.Oneway, 101);
      ourWriter.writeFieldBegin(WireType.String, 1);
      ourWriter.writeString("user_registered");
      ourWriter.writeFieldStop();
      const bytes = ourWriter.finish();

      const decoded = decodeWithApache(bytes, (proto) => {
        const msg = proto.readMessageBegin();
        proto.readFieldBegin();
        const event = proto.readString();
        proto.readFieldBegin(); // stop
        proto.readMessageEnd();
        return { msg, event };
      });

      expect(decoded).toEqual({
        msg: { fname: "notifyEvent", mtype: 4, rseqid: 101 }, // 4 = Oneway
        event: "user_registered",
      });
    });

    test("RPC Application Exception (TApplicationException): Apache writes exception, our BinaryReader reads it", () => {
      const exceptionBytes = encodeWithApache((proto) => {
        proto.writeMessageBegin("unknownMethod", 3, 50); // 3 = Exception
        proto.writeFieldBegin("message", 11, 1);
        proto.writeString("Unknown method: unknownMethod");
        proto.writeFieldBegin("type", 8, 2);
        proto.writeI32(1); // UNKNOWN_METHOD = 1
        proto.writeFieldStop();
        proto.writeMessageEnd();
      });

      const reader = new BinaryReader(exceptionBytes);
      const header = reader.readMessageBegin();
      expect(header).toEqual({
        name: "unknownMethod",
        type: MessageType.Exception,
        sequenceId: 50,
      });

      expect(reader.readFieldBegin()).toEqual({ id: 1, type: WireType.String });
      expect(reader.readString()).toBe("Unknown method: unknownMethod");
      expect(reader.readFieldBegin()).toEqual({ id: 2, type: WireType.I32 });
      expect(reader.readI32()).toBe(1);
      expect(reader.readFieldBegin().type).toBe(WireType.Stop);
      reader.assertDone();
    });
  });

  describe("End-to-End createMetadataClient with complex objects and Apache wire codecs", () => {
    const complexMetadata: Metadata[] = [
      {
        name: "bank",
        path: "bank.thrift",
        ast: {
          struct: {
            Currency: [
              { id: 1, name: "symbol", type: "string" },
              { id: 2, name: "numericCode", type: "i16" },
            ],
            AccountBalance: [
              { id: 1, name: "amount", type: "i64" },
              { id: 2, name: "verified", type: "bool" },
            ],
            TransferRequest: [
              { id: 1, name: "sourceAccount", type: "string" },
              { id: 2, name: "destinationAccount", type: "string" },
              {
                id: 3,
                name: "balances",
                type: { name: "map", keyType: "Currency", valueType: "AccountBalance" },
              },
              { id: 4, name: "signature", type: "binary" },
              { id: 5, name: "note", type: "string", option: "optional" },
            ],
            TransferResponse: [
              { id: 1, name: "txId", type: "i64" },
              { id: 2, name: "status", type: "string" },
            ],
          },
          exception: {
            AccountError: [
              { id: 1, name: "code", type: "i32" },
              { id: 2, name: "description", type: "string" },
            ],
          },
          service: {
            BankService: {
              functions: {
                transfer: {
                  name: "transfer",
                  type: "TransferResponse",
                  args: [{ id: 1, name: "request", type: "TransferRequest" }],
                  throws: [{ id: 1, name: "error", type: "AccountError" }],
                  oneway: false,
                },
                ping: {
                  name: "ping",
                  type: "void",
                  args: [{ id: 1, name: "msg", type: "string" }],
                  throws: [],
                  oneway: true,
                },
              },
            },
          },
        },
      },
    ];

    test("client successfully calls transfer method with complex object and receives Apache-encoded response", async () => {
      interface BankClient {
        transfer(req: any): Promise<any>;
        ping(msg: string): Promise<void>;
      }

      let capturedCallName = "";
      let capturedCallSeqId = 0;
      let capturedPayload: any;

      const client = await createMetadataClient<BankClient>({
        endpoint: "unused",
        namespace: "bank",
        serviceName: "BankService",
        metadata: complexMetadata,
        transport: async (requestBytes) => {
          // Decode request with Apache Thrift
          decodeWithApache(requestBytes, (proto) => {
            const msg = proto.readMessageBegin();
            capturedCallName = msg.fname;
            capturedCallSeqId = msg.rseqid;

            // Arg 1: TransferRequest (id: 1)
            proto.readFieldBegin();
            // sourceAccount (id: 1)
            proto.readFieldBegin();
            const source = proto.readString();
            // destinationAccount (id: 2)
            proto.readFieldBegin();
            const dest = proto.readString();
            // balances map (id: 3)
            proto.readFieldBegin();
            const mapHeader = proto.readMapBegin();
            // Map item 1: Key Currency struct
            proto.readFieldBegin();
            const symbol = proto.readString();
            proto.readFieldBegin();
            const numCode = proto.readI16();
            proto.readFieldBegin(); // stop
            // Map item 1: Value AccountBalance struct
            proto.readFieldBegin();
            const amount = toBigInt(proto.readI64());
            proto.readFieldBegin();
            const verified = proto.readBool();
            proto.readFieldBegin(); // stop
            // signature binary (id: 4)
            proto.readFieldBegin();
            const sig = [...proto.readBinary()];
            // note (id: 5)
            proto.readFieldBegin();
            const note = proto.readString();
            proto.readFieldBegin(); // TransferRequest stop
            proto.readFieldBegin(); // args stop
            proto.readMessageEnd();

            capturedPayload = {
              source,
              dest,
              mapHeader,
              symbol,
              numCode,
              amount,
              verified,
              sig,
              note,
            };
          });

          // Encode response with Apache Thrift
          return encodeWithApache((proto) => {
            proto.writeMessageBegin("transfer", 2, capturedCallSeqId);
            proto.writeFieldBegin("success", 12, 0);
            proto.writeFieldBegin("txId", 10, 1);
            proto.writeI64(fromBigInt(998877665544n));
            proto.writeFieldBegin("status", 11, 2);
            proto.writeString("SUCCESS");
            proto.writeFieldStop();
            proto.writeFieldStop();
            proto.writeMessageEnd();
          });
        },
      });

      const signatureBytes = new Uint8Array([0xca, 0xfe, 0xba, 0xbe]);
      const currencyKey = { symbol: "USD", numericCode: 840 };
      const balanceVal = { amount: 50000n, verified: true };
      const balancesMap = new Map([[currencyKey, balanceVal]]);

      const response = await client.transfer({
        sourceAccount: "ACC-1",
        destinationAccount: "ACC-2",
        balances: balancesMap,
        signature: signatureBytes,
        note: "Urgent transfer",
      });

      // Assert Apache server correctly verified the request
      expect(capturedCallName).toBe("transfer");
      expect(capturedCallSeqId).toBe(1);
      expect(capturedPayload).toEqual({
        source: "ACC-1",
        dest: "ACC-2",
        mapHeader: { ktype: 12, vtype: 12, size: 1 },
        symbol: "USD",
        numCode: 840,
        amount: 50000n,
        verified: true,
        sig: [0xca, 0xfe, 0xba, 0xbe],
        note: "Urgent transfer",
      });

      // Assert client correctly parsed the Apache server response
      expect(response).toEqual({
        txId: 998877665544n,
        status: "SUCCESS",
      });
    });

    test("client catches declared exception returned by Apache server", async () => {
      interface BankClient {
        transfer(req: any): Promise<any>;
      }

      const client = await createMetadataClient<BankClient>({
        endpoint: "unused",
        namespace: "bank",
        serviceName: "BankService",
        metadata: complexMetadata,
        transport: async (requestBytes) => {
          const reader = new BinaryReader(requestBytes);
          const header = reader.readMessageBegin();

          // Encode declared exception with Apache Thrift
          return encodeWithApache((proto) => {
            proto.writeMessageBegin("transfer", 2, header.sequenceId);
            // Field 1: declared exception (AccountError)
            proto.writeFieldBegin("error", 12, 1);
            proto.writeFieldBegin("code", 8, 1);
            proto.writeI32(403);
            proto.writeFieldBegin("description", 11, 2);
            proto.writeString("Account frozen");
            proto.writeFieldStop();
            proto.writeFieldStop();
            proto.writeMessageEnd();
          });
        },
      });

      await expect(
        client.transfer({
          sourceAccount: "ACC-1",
          destinationAccount: "ACC-2",
          balances: new Map(),
          signature: new Uint8Array([1]),
        }),
      ).rejects.toMatchObject({
        data: { code: 403, description: "Account frozen" },
        isService: true,
      });
    });

    test("client handles oneway method call verified by Apache server", async () => {
      interface BankClient {
        ping(msg: string): Promise<void>;
      }

      let capturedOneway = false;
      let capturedMsg = "";

      const client = await createMetadataClient<BankClient>({
        endpoint: "unused",
        namespace: "bank",
        serviceName: "BankService",
        metadata: complexMetadata,
        transport: async (requestBytes) => {
          decodeWithApache(requestBytes, (proto) => {
            const header = proto.readMessageBegin();
            if (header.mtype === 4 && header.fname === "ping") {
              capturedOneway = true;
            }
            proto.readFieldBegin();
            capturedMsg = proto.readString();
            proto.readFieldBegin(); // stop
            proto.readMessageEnd();
          });
          return new Uint8Array();
        },
      });

      await client.ping("heartbeat-data");
      expect(capturedOneway).toBe(true);
      expect(capturedMsg).toBe("heartbeat-data");
    });

    test("cross-decodes and matches byte-for-byte with Apache 0.24 writeUuid and readUuid", () => {
      const testUuid = "123e4567-e89b-12d3-a456-426614174000";

      // 1. Byte-for-byte match
      const ourWriter = new BinaryWriter();
      ourWriter.writeFieldBegin(WireType.Uuid, 1);
      ourWriter.writeUuid(testUuid);
      ourWriter.writeFieldStop();
      const ourBytes = ourWriter.finish();

      const apacheBytes = encodeWithApache((proto) => {
        proto.writeFieldBegin("id", 16, 1);
        proto.writeUuid(testUuid);
        proto.writeFieldStop();
      });

      expect(Array.from(ourBytes)).toEqual(Array.from(apacheBytes));

      // 2. Apache decodes our bytes
      const decodedByApache = decodeWithApache(ourBytes, (proto) => {
        proto.readFieldBegin();
        const value = proto.readUuid();
        proto.readFieldBegin(); // stop
        return value;
      });
      expect(decodedByApache).toBe(testUuid);

      // 3. Our reader decodes Apache bytes
      const ourReader = new BinaryReader(apacheBytes);
      const field = ourReader.readFieldBegin();
      expect(field).toEqual({ type: WireType.Uuid, id: 1 });
      expect(ourReader.readUuid()).toBe(testUuid);
      expect(ourReader.readFieldBegin().type).toBe(WireType.Stop);
      ourReader.assertDone();
    });
  });
});
