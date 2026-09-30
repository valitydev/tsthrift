import { createRequire } from "node:module";
import { describe, expect, test } from "vite-plus/test";
import { type Metadata, createMetadataClient } from "../src/index.ts";

const require = createRequire(import.meta.url);
const { TBinaryProtocol, TBufferedTransport, fromBigInt, toBigInt } = require("thrift") as {
  TBinaryProtocol: any;
  TBufferedTransport: any;
  fromBigInt: (val: bigint) => any;
  toBigInt: (val: any) => bigint;
};

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

function decodeWithApache<T>(bytes: Uint8Array, fn: (proto: any) => T): T {
  let result!: T;
  TBufferedTransport.receiver((transport: any) => {
    const protocol = new TBinaryProtocol(transport);
    result = fn(protocol);
  })(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  return result;
}

interface ItemStruct {
  itemId: string;
  quantity: number;
}

interface VariantUnion {
  strChoice?: string;
  numChoice?: bigint;
}

interface MultiResult {
  summary: string;
  checksum: bigint;
}

interface MultiArgService {
  executeAll(
    byteVal: number,
    shortVal: number,
    intVal: number,
    longVal: bigint,
    doubleVal: number,
    flagVal: boolean,
    strVal: string,
    binVal: Uint8Array,
    listVal: string[],
    setVal: Set<number>,
    mapVal: Map<string, bigint>,
    structVal: ItemStruct,
    unionVal: VariantUnion,
    optionalVal?: string,
  ): Promise<MultiResult>;

  permuted(first: number, third: string, second: boolean): Promise<string>;
}

const multiArgMetadata: Metadata[] = [
  {
    name: "multi",
    path: "multi.thrift",
    ast: {
      union: {
        VariantUnion: [
          { id: 1, name: "strChoice", type: "string" },
          { id: 2, name: "numChoice", type: "i64" },
        ],
      },
      struct: {
        ItemStruct: [
          { id: 1, name: "itemId", type: "string" },
          { id: 2, name: "quantity", type: "i32" },
        ],
        MultiResult: [
          { id: 1, name: "summary", type: "string" },
          { id: 2, name: "checksum", type: "i64" },
        ],
      },
      service: {
        MultiArgService: {
          functions: {
            executeAll: {
              name: "executeAll",
              type: "MultiResult",
              args: [
                { id: 1, name: "byteVal", type: "byte" },
                { id: 2, name: "shortVal", type: "i16" },
                { id: 3, name: "intVal", type: "i32" },
                { id: 4, name: "longVal", type: "i64" },
                { id: 5, name: "doubleVal", type: "double" },
                { id: 6, name: "flagVal", type: "bool" },
                { id: 7, name: "strVal", type: "string" },
                { id: 8, name: "binVal", type: "binary" },
                { id: 9, name: "listVal", type: { name: "list", valueType: "string" } },
                { id: 10, name: "setVal", type: { name: "set", valueType: "i32" } },
                {
                  id: 11,
                  name: "mapVal",
                  type: { name: "map", keyType: "string", valueType: "i64" },
                },
                { id: 12, name: "structVal", type: "ItemStruct" },
                { id: 13, name: "unionVal", type: "VariantUnion" },
                { id: 14, name: "optionalVal", type: "string", option: "optional" },
              ],
              throws: [],
              oneway: false,
            },
            permuted: {
              name: "permuted",
              type: "string",
              args: [
                { id: 1, name: "first", type: "i32" },
                { id: 3, name: "third", type: "string" },
                { id: 2, name: "second", type: "bool" },
              ],
              throws: [],
              oneway: false,
            },
          },
        },
      },
    },
  },
];

const testArgs = {
  byteVal: 127,
  shortVal: -32000,
  intVal: 12345678,
  longVal: 9007199254740993n,
  doubleVal: 3.141592653589793,
  flagVal: true,
  strVal: "Thrift Multi-Arg Test: Привет 🚀 \0 null byte inside",
  binVal: new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0xff]),
  listVal: ["item-alpha", "item-beta", "item-gamma"],
  setVal: new Set([10, 20, 30]),
  mapVal: new Map([
    ["k1", 100n],
    ["k2", 200n],
  ]),
  structVal: { itemId: "ITEM-999", quantity: 42 },
  unionVal: { strChoice: "chosen-branch" } as VariantUnion,
  optionalVal: "optional-provided",
};

/** Writes Apache Thrift executeAll_args. */
function writeApacheExecuteAllArgs(
  proto: any,
  args: typeof testArgs,
  includeOptional = true,
): void {
  proto.writeStructBegin("executeAll_args");

  // 1: byte
  proto.writeFieldBegin("byteVal", 3, 1);
  proto.writeByte(args.byteVal);
  proto.writeFieldEnd();

  // 2: i16
  proto.writeFieldBegin("shortVal", 6, 2);
  proto.writeI16(args.shortVal);
  proto.writeFieldEnd();

  // 3: i32
  proto.writeFieldBegin("intVal", 8, 3);
  proto.writeI32(args.intVal);
  proto.writeFieldEnd();

  // 4: i64
  proto.writeFieldBegin("longVal", 10, 4);
  proto.writeI64(fromBigInt(args.longVal));
  proto.writeFieldEnd();

  // 5: double
  proto.writeFieldBegin("doubleVal", 4, 5);
  proto.writeDouble(args.doubleVal);
  proto.writeFieldEnd();

  // 6: bool
  proto.writeFieldBegin("flagVal", 2, 6);
  proto.writeBool(args.flagVal);
  proto.writeFieldEnd();

  // 7: string
  proto.writeFieldBegin("strVal", 11, 7);
  proto.writeString(args.strVal);
  proto.writeFieldEnd();

  // 8: binary
  proto.writeFieldBegin("binVal", 11, 8);
  proto.writeBinary(Buffer.from(args.binVal));
  proto.writeFieldEnd();

  // 9: list<string>
  proto.writeFieldBegin("listVal", 15, 9);
  proto.writeListBegin(11, args.listVal.length);
  for (const item of args.listVal) proto.writeString(item);
  proto.writeListEnd();
  proto.writeFieldEnd();

  // 10: set<i32>
  proto.writeFieldBegin("setVal", 14, 10);
  proto.writeSetBegin(8, args.setVal.size);
  for (const item of args.setVal) proto.writeI32(item);
  proto.writeSetEnd();
  proto.writeFieldEnd();

  // 11: map<string, i64>
  proto.writeFieldBegin("mapVal", 13, 11);
  proto.writeMapBegin(11, 10, args.mapVal.size);
  for (const [k, v] of args.mapVal) {
    proto.writeString(k);
    proto.writeI64(fromBigInt(v));
  }
  proto.writeMapEnd();
  proto.writeFieldEnd();

  // 12: ItemStruct
  proto.writeFieldBegin("structVal", 12, 12);
  proto.writeStructBegin("ItemStruct");
  proto.writeFieldBegin("itemId", 11, 1);
  proto.writeString(args.structVal.itemId);
  proto.writeFieldEnd();
  proto.writeFieldBegin("quantity", 8, 2);
  proto.writeI32(args.structVal.quantity);
  proto.writeFieldEnd();
  proto.writeFieldStop();
  proto.writeStructEnd();
  proto.writeFieldEnd();

  // 13: VariantUnion
  proto.writeFieldBegin("unionVal", 12, 13);
  proto.writeStructBegin("VariantUnion");
  if (args.unionVal.strChoice !== undefined) {
    proto.writeFieldBegin("strChoice", 11, 1);
    proto.writeString(args.unionVal.strChoice);
    proto.writeFieldEnd();
  } else if (args.unionVal.numChoice !== undefined) {
    proto.writeFieldBegin("numChoice", 10, 2);
    proto.writeI64(fromBigInt(args.unionVal.numChoice));
    proto.writeFieldEnd();
  }
  proto.writeFieldStop();
  proto.writeStructEnd();
  proto.writeFieldEnd();

  // 14: optional string
  if (includeOptional && args.optionalVal !== undefined) {
    proto.writeFieldBegin("optionalVal", 11, 14);
    proto.writeString(args.optionalVal);
    proto.writeFieldEnd();
  }

  proto.writeFieldStop();
  proto.writeStructEnd();
}

describe("Binary format with services containing diverse argument types", () => {
  test("exact byte-for-byte wire parity on RPC call with 14 diverse argument types", async () => {
    let capturedRequestBytes!: Uint8Array;

    const client = await createMetadataClient<MultiArgService>({
      endpoint: "unused",
      namespace: "multi",
      serviceName: "MultiArgService",
      metadata: multiArgMetadata,
      transport: async (requestBytes) => {
        capturedRequestBytes = requestBytes;
        // Return dummy reply
        return encodeWithApache((proto) => {
          proto.writeMessageBegin("executeAll", 2, 1);
          proto.writeStructBegin("executeAll_result");
          proto.writeFieldBegin("success", 12, 0);
          proto.writeStructBegin("MultiResult");
          proto.writeFieldBegin("summary", 11, 1);
          proto.writeString("OK");
          proto.writeFieldEnd();
          proto.writeFieldBegin("checksum", 10, 2);
          proto.writeI64(fromBigInt(12345n));
          proto.writeFieldEnd();
          proto.writeFieldStop();
          proto.writeStructEnd();
          proto.writeFieldEnd();
          proto.writeFieldStop();
          proto.writeStructEnd();
          proto.writeMessageEnd();
        });
      },
    });

    await client.executeAll(
      testArgs.byteVal,
      testArgs.shortVal,
      testArgs.intVal,
      testArgs.longVal,
      testArgs.doubleVal,
      testArgs.flagVal,
      testArgs.strVal,
      testArgs.binVal,
      testArgs.listVal,
      testArgs.setVal,
      testArgs.mapVal,
      testArgs.structVal,
      testArgs.unionVal,
      testArgs.optionalVal,
    );

    // Encode exact same call via official Apache Thrift
    const apacheRequestBytes = encodeWithApache((proto) => {
      proto.writeMessageBegin("executeAll", 1, 1); // CALL, seqId 1
      writeApacheExecuteAllArgs(proto, testArgs, true);
      proto.writeMessageEnd();
    });

    expect(capturedRequestBytes.byteLength).toBe(apacheRequestBytes.byteLength);
    expect(Buffer.from(capturedRequestBytes).toString("hex")).toBe(
      Buffer.from(apacheRequestBytes).toString("hex"),
    );
  });

  test("Apache Thrift server decodes all 14 diverse argument types correctly", async () => {
    let serverDecodedArgs: any = {};

    const client = await createMetadataClient<MultiArgService>({
      endpoint: "unused",
      namespace: "multi",
      serviceName: "MultiArgService",
      metadata: multiArgMetadata,
      transport: async (requestBytes) => {
        // Apache decodes the request with all 14 arguments
        decodeWithApache(requestBytes, (proto) => {
          const header = proto.readMessageBegin();
          expect(header.fname).toBe("executeAll");
          expect(header.mtype).toBe(1);

          proto.readStructBegin();
          while (true) {
            const field = proto.readFieldBegin();
            if (field.ftype === 0) break;

            switch (field.fid) {
              case 1:
                serverDecodedArgs.byteVal = proto.readByte();
                break;
              case 2:
                serverDecodedArgs.shortVal = proto.readI16();
                break;
              case 3:
                serverDecodedArgs.intVal = proto.readI32();
                break;
              case 4:
                serverDecodedArgs.longVal = toBigInt(proto.readI64());
                break;
              case 5:
                serverDecodedArgs.doubleVal = proto.readDouble();
                break;
              case 6:
                serverDecodedArgs.flagVal = proto.readBool();
                break;
              case 7:
                serverDecodedArgs.strVal = proto.readString();
                break;
              case 8:
                serverDecodedArgs.binVal = new Uint8Array(proto.readBinary());
                break;
              case 9: {
                const lh = proto.readListBegin();
                serverDecodedArgs.listVal = [];
                for (let i = 0; i < lh.size; i++)
                  serverDecodedArgs.listVal.push(proto.readString());
                proto.readListEnd();
                break;
              }
              case 10: {
                const sh = proto.readSetBegin();
                serverDecodedArgs.setVal = new Set();
                for (let i = 0; i < sh.size; i++) serverDecodedArgs.setVal.add(proto.readI32());
                proto.readSetEnd();
                break;
              }
              case 11: {
                const mh = proto.readMapBegin();
                serverDecodedArgs.mapVal = new Map();
                for (let i = 0; i < mh.size; i++) {
                  const k = proto.readString();
                  const v = toBigInt(proto.readI64());
                  serverDecodedArgs.mapVal.set(k, v);
                }
                proto.readMapEnd();
                break;
              }
              case 12: {
                proto.readStructBegin();
                let itemId = "";
                let quantity = 0;
                while (true) {
                  const sf = proto.readFieldBegin();
                  if (sf.ftype === 0) break;
                  if (sf.fid === 1) itemId = proto.readString();
                  else if (sf.fid === 2) quantity = proto.readI32();
                  else proto.skip(sf.ftype);
                  proto.readFieldEnd();
                }
                proto.readStructEnd();
                serverDecodedArgs.structVal = { itemId, quantity };
                break;
              }
              case 13: {
                proto.readStructBegin();
                let strChoice: string | undefined;
                while (true) {
                  const uf = proto.readFieldBegin();
                  if (uf.ftype === 0) break;
                  if (uf.fid === 1) strChoice = proto.readString();
                  else proto.skip(uf.ftype);
                  proto.readFieldEnd();
                }
                proto.readStructEnd();
                serverDecodedArgs.unionVal = { strChoice };
                break;
              }
              case 14:
                serverDecodedArgs.optionalVal = proto.readString();
                break;
              default:
                proto.skip(field.ftype);
                break;
            }
            proto.readFieldEnd();
          }
          proto.readStructEnd();
          proto.readMessageEnd();
        });

        // Apache responds with success
        return encodeWithApache((proto) => {
          proto.writeMessageBegin("executeAll", 2, 1);
          proto.writeStructBegin("executeAll_result");
          proto.writeFieldBegin("success", 12, 0);
          proto.writeStructBegin("MultiResult");
          proto.writeFieldBegin("summary", 11, 1);
          proto.writeString("14 arguments verified by Apache");
          proto.writeFieldEnd();
          proto.writeFieldBegin("checksum", 10, 2);
          proto.writeI64(fromBigInt(777n));
          proto.writeFieldEnd();
          proto.writeFieldStop();
          proto.writeStructEnd();
          proto.writeFieldEnd();
          proto.writeFieldStop();
          proto.writeStructEnd();
          proto.writeMessageEnd();
        });
      },
    });

    const response = await client.executeAll(
      testArgs.byteVal,
      testArgs.shortVal,
      testArgs.intVal,
      testArgs.longVal,
      testArgs.doubleVal,
      testArgs.flagVal,
      testArgs.strVal,
      testArgs.binVal,
      testArgs.listVal,
      testArgs.setVal,
      testArgs.mapVal,
      testArgs.structVal,
      testArgs.unionVal,
      testArgs.optionalVal,
    );

    // Validate all 14 decoded argument fields on the Apache side
    expect(serverDecodedArgs.byteVal).toBe(127);
    expect(serverDecodedArgs.shortVal).toBe(-32000);
    expect(serverDecodedArgs.intVal).toBe(12345678);
    expect(serverDecodedArgs.longVal).toBe(9007199254740993n);
    expect(serverDecodedArgs.doubleVal).toBeCloseTo(3.141592653589793);
    expect(serverDecodedArgs.flagVal).toBe(true);
    expect(serverDecodedArgs.strVal).toBe("Thrift Multi-Arg Test: Привет 🚀 \0 null byte inside");
    expect(serverDecodedArgs.binVal).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0xff]));
    expect(serverDecodedArgs.listVal).toEqual(["item-alpha", "item-beta", "item-gamma"]);
    expect(serverDecodedArgs.setVal).toEqual(new Set([10, 20, 30]));
    expect(serverDecodedArgs.mapVal).toEqual(
      new Map([
        ["k1", 100n],
        ["k2", 200n],
      ]),
    );
    expect(serverDecodedArgs.structVal).toEqual({ itemId: "ITEM-999", quantity: 42 });
    expect(serverDecodedArgs.unionVal).toEqual({ strChoice: "chosen-branch" });
    expect(serverDecodedArgs.optionalVal).toBe("optional-provided");

    // Validate client parsed response
    expect(response).toEqual({
      summary: "14 arguments verified by Apache",
      checksum: 777n,
    });
  });

  test("omitted optional argument does not produce field in binary stream and matches Apache", async () => {
    let capturedBytesWithoutOptional!: Uint8Array;

    const client = await createMetadataClient<MultiArgService>({
      endpoint: "unused",
      namespace: "multi",
      serviceName: "MultiArgService",
      metadata: multiArgMetadata,
      transport: async (requestBytes) => {
        capturedBytesWithoutOptional = requestBytes;
        return encodeWithApache((proto) => {
          proto.writeMessageBegin("executeAll", 2, 1);
          proto.writeStructBegin("executeAll_result");
          proto.writeFieldBegin("success", 12, 0);
          proto.writeStructBegin("MultiResult");
          proto.writeFieldBegin("summary", 11, 1);
          proto.writeString("OK");
          proto.writeFieldEnd();
          proto.writeFieldBegin("checksum", 10, 2);
          proto.writeI64(fromBigInt(0n));
          proto.writeFieldEnd();
          proto.writeFieldStop();
          proto.writeStructEnd();
          proto.writeFieldEnd();
          proto.writeFieldStop();
          proto.writeStructEnd();
          proto.writeMessageEnd();
        });
      },
    });

    // Call without the optional 14th argument (undefined)
    await client.executeAll(
      testArgs.byteVal,
      testArgs.shortVal,
      testArgs.intVal,
      testArgs.longVal,
      testArgs.doubleVal,
      testArgs.flagVal,
      testArgs.strVal,
      testArgs.binVal,
      testArgs.listVal,
      testArgs.setVal,
      testArgs.mapVal,
      testArgs.structVal,
      testArgs.unionVal,
      undefined,
    );

    // Apache encodes without optional argument
    const apacheBytesWithoutOptional = encodeWithApache((proto) => {
      proto.writeMessageBegin("executeAll", 1, 1);
      writeApacheExecuteAllArgs(proto, testArgs, false); // includeOptional = false
      proto.writeMessageEnd();
    });

    expect(capturedBytesWithoutOptional.byteLength).toBe(apacheBytesWithoutOptional.byteLength);
    expect(Buffer.from(capturedBytesWithoutOptional).toString("hex")).toBe(
      Buffer.from(apacheBytesWithoutOptional).toString("hex"),
    );
  });

  test("arguments with permuted IDL field IDs (1, 3, 2) are mapped accurately to binary fields", async () => {
    let capturedPermutedBytes!: Uint8Array;

    const client = await createMetadataClient<MultiArgService>({
      endpoint: "unused",
      namespace: "multi",
      serviceName: "MultiArgService",
      metadata: multiArgMetadata,
      transport: async (requestBytes) => {
        capturedPermutedBytes = requestBytes;
        return encodeWithApache((proto) => {
          proto.writeMessageBegin("permuted", 2, 1);
          proto.writeStructBegin("permuted_result");
          proto.writeFieldBegin("success", 11, 0);
          proto.writeString("permuted-ok");
          proto.writeFieldEnd();
          proto.writeFieldStop();
          proto.writeStructEnd();
          proto.writeMessageEnd();
        });
      },
    });

    // Function signature: permuted(first: i32 (id: 1), third: string (id: 3), second: bool (id: 2))
    // Arguments in metadata are: [1: first, 3: third, 2: second].
    const result = await client.permuted(42, "hello-permuted", true);
    expect(result).toBe("permuted-ok");

    // Decode with Apache to verify exact field IDs in wire format
    decodeWithApache(capturedPermutedBytes, (proto) => {
      const header = proto.readMessageBegin();
      expect(header.fname).toBe("permuted");

      proto.readStructBegin();
      const fields: { id: number; val: any }[] = [];
      while (true) {
        const f = proto.readFieldBegin();
        if (f.ftype === 0) break;
        if (f.fid === 1) fields.push({ id: 1, val: proto.readI32() });
        else if (f.fid === 2) fields.push({ id: 2, val: proto.readBool() });
        else if (f.fid === 3) fields.push({ id: 3, val: proto.readString() });
        proto.readFieldEnd();
      }
      proto.readStructEnd();
      proto.readMessageEnd();

      expect(fields.find((f) => f.id === 1)?.val).toBe(42);
      expect(fields.find((f) => f.id === 3)?.val).toBe("hello-permuted");
      expect(fields.find((f) => f.id === 2)?.val).toBe(true);
    });
  });
});
