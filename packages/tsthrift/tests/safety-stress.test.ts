import { createRequire } from "node:module";
import { describe, expect, test } from "vite-plus/test";
import {
  BinaryWriter,
  MessageType,
  type Metadata,
  WireType,
  createMetadataClient,
} from "../src/index.ts";

const require = createRequire(import.meta.url);
const { TBinaryProtocol, TBufferedTransport } = require("thrift") as {
  TBinaryProtocol: any;
  TBufferedTransport: any;
};

const safetyMetadata: Metadata[] = [
  {
    path: "safety.thrift",
    name: "safety",
    ast: {
      struct: {
        SimpleItem: [{ name: "id", type: "i64", id: 1 }],
        SafetyResponse: [
          { name: "count", type: "i32", id: 1 },
          { name: "items", type: { name: "list", valueType: "SimpleItem" }, id: 2 },
        ],
      },
      service: {
        SafetyService: {
          functions: {
            check: {
              type: "SafetyResponse",
              name: "check",
              oneway: false,
              args: [],
              throws: [],
            },
          },
        },
      },
    },
  },
];

const stressMetadata: Metadata[] = [
  {
    path: "stress.thrift",
    name: "stress",
    ast: {
      struct: {
        Item: [
          { name: "id", type: "i64", id: 1 },
          { name: "title", type: "string", id: 2 },
          { name: "score", type: "double", id: 3 },
          { name: "tags", type: { name: "set", valueType: "string" }, id: 4 },
          { name: "meta", type: { name: "map", keyType: "string", valueType: "i32" }, id: 5 },
        ],
        BatchRequest: [{ name: "items", type: { name: "list", valueType: "Item" }, id: 1 }],
        BatchResponse: [
          { name: "count", type: "i32", id: 1 },
          { name: "items", type: { name: "list", valueType: "Item" }, id: 2 },
        ],
      },
      service: {
        StressService: {
          functions: {
            processBatch: {
              type: "BatchResponse",
              name: "processBatch",
              oneway: false,
              args: [{ name: "req", type: "BatchRequest", id: 1 }],
              throws: [],
            },
          },
        },
      },
    },
  },
];

describe("Native codec safety, DoS protection & stress tests", () => {
  test("protects against OOM attack on corrupt collection size header", async () => {
    // Write reply claiming 1,000,000,000 elements in a short buffer
    const writer = new BinaryWriter();
    writer.writeMessageBegin("check", MessageType.Reply, 1);
    writer.writeFieldBegin(WireType.Struct, 0); // success (SafetyResponse)
    writer.writeFieldBegin(WireType.List, 2); // items list
    writer.writeByte(WireType.Struct);
    writer.writeI32(1_000_000_000); // 1 billion elements
    const corruptBytes = writer.finish();

    const client = await createMetadataClient<{ check: () => Promise<unknown> }>({
      endpoint: "unused",
      serviceName: "SafetyService",
      namespace: "safety",
      metadata: safetyMetadata,
      transport: async () => corruptBytes,
    });

    // Reader must reject immediately without allocating 1B elements in heap
    await expect(client.check()).rejects.toThrow(RangeError);
  });

  test("safely handles truncated buffers without hanging or unhandled errors", async () => {
    const writer = new BinaryWriter();
    writer.writeMessageBegin("check", MessageType.Reply, 1);
    writer.writeFieldBegin(WireType.Struct, 0);
    writer.writeFieldBegin(WireType.I32, 1);
    writer.writeI32(123);
    writer.writeFieldStop();
    writer.writeFieldStop();
    const validReply = writer.finish();

    const cutoffs = [1, 5, 10, 15, validReply.byteLength - 2];
    for (const cutoff of cutoffs) {
      const truncated = validReply.subarray(0, cutoff);
      const client = await createMetadataClient<{ check: () => Promise<unknown> }>({
        endpoint: "unused",
        serviceName: "SafetyService",
        namespace: "safety",
        metadata: safetyMetadata,
        transport: async () => truncated,
      });

      await expect(client.check()).rejects.toThrow(RangeError);
    }
  });

  test("skips large unknown fields without allocating memory for skipped payload", async () => {
    // Create an Apache response with an unknown field 99 containing 2,000 strings
    let responseWithFutureField!: Buffer;
    const transport = new TBufferedTransport(undefined, (buf: Buffer) => {
      responseWithFutureField = buf;
    });
    const proto = new TBinaryProtocol(transport);
    proto.writeMessageBegin("check", MessageType.Reply, 1);
    proto.writeStructBegin("check_result");
    proto.writeFieldBegin("success", WireType.Struct, 0);
    proto.writeStructBegin("SafetyResponse");

    // Known field 1: count
    proto.writeFieldBegin("count", WireType.I32, 1);
    proto.writeI32(42);
    proto.writeFieldEnd();

    // Unknown field 99: large list of 2,000 strings
    proto.writeFieldBegin("unknownFutureList", WireType.List, 99);
    proto.writeListBegin(WireType.String, 2_000);
    for (let i = 0; i < 2_000; i++) proto.writeString(`future-payload-${i}`);
    proto.writeListEnd();
    proto.writeFieldEnd();

    // Known field 2: items (empty list)
    proto.writeFieldBegin("items", WireType.List, 2);
    proto.writeListBegin(WireType.Struct, 0);
    proto.writeListEnd();
    proto.writeFieldEnd();

    proto.writeFieldStop();
    proto.writeStructEnd(); // SafetyResponse
    proto.writeFieldEnd();
    proto.writeFieldStop();
    proto.writeStructEnd(); // result
    proto.writeMessageEnd();
    transport.flush();

    const client = await createMetadataClient<{
      check: () => Promise<{ count: number; items: unknown[] }>;
    }>({
      endpoint: "unused",
      serviceName: "SafetyService",
      namespace: "safety",
      metadata: safetyMetadata,
      transport: async () => new Uint8Array(responseWithFutureField),
    });

    const res = await client.check();
    expect(res.count).toBe(42);
    expect(res.items).toEqual([]);
    expect((res as Record<string, unknown>).unknownFutureList).toBeUndefined();
  });

  test("differential roundtrip with Apache 0.24 on 5,000 complex nested items", async () => {
    const itemCount = 5_000;
    const items = Array.from({ length: itemCount }, (_, i) => ({
      id: 10_000_000n + BigInt(i),
      title: `Stress item #${i} with unicode Привет 🚀`,
      score: i * 1.5,
      tags: new Set([`tag-${i % 5}`, "benchmark"]),
      meta: new Map([
        [`k_${i % 10}`, i],
        ["status", 200],
      ]),
    }));

    let requestCapturedByApache = false;

    const client = await createMetadataClient<{
      processBatch: (req: { items: typeof items }) => Promise<{
        count: number;
        items: Array<{ id: bigint; title: string }>;
      }>;
    }>({
      endpoint: "unused",
      serviceName: "StressService",
      namespace: "stress",
      metadata: stressMetadata,
      transport: async (requestBytes, _options) => {
        // 1. Apache Thrift reads the bytes generated by our native serializer
        let apacheDecodedCount = 0;
        TBufferedTransport.receiver((transport: unknown) => {
          const inProto = new TBinaryProtocol(transport);
          const msg = inProto.readMessageBegin();
          expect(msg.fname).toBe("processBatch");
          expect(msg.mtype).toBe(1); // CALL
          expect(msg.rseqid).toBe(1);

          inProto.readStructBegin(); // args
          const f1 = inProto.readFieldBegin();
          expect(f1.fid).toBe(1);
          inProto.readStructBegin(); // BatchRequest
          const reqField = inProto.readFieldBegin();
          expect(reqField.fid).toBe(1);

          const listHeader = inProto.readListBegin();
          expect(listHeader.size).toBe(itemCount);

          for (let i = 0; i < listHeader.size; i++) {
            inProto.readStructBegin();
            inProto.readFieldBegin(); // id
            const id = inProto.readI64();
            expect(BigInt(id.toString())).toBe(10_000_000n + BigInt(i));
            inProto.readFieldEnd();

            inProto.readFieldBegin(); // title
            const title = inProto.readString();
            expect(title).toBe(`Stress item #${i} with unicode Привет 🚀`);
            inProto.readFieldEnd();

            inProto.readFieldBegin(); // score
            inProto.readDouble();
            inProto.readFieldEnd();

            inProto.readFieldBegin(); // tags
            const setH = inProto.readSetBegin();
            for (let s = 0; s < setH.size; s++) inProto.readString();
            inProto.readSetEnd();
            inProto.readFieldEnd();

            inProto.readFieldBegin(); // meta
            const mapH = inProto.readMapBegin();
            for (let m = 0; m < mapH.size; m++) {
              inProto.readString();
              inProto.readI32();
            }
            inProto.readMapEnd();
            inProto.readFieldEnd();

            const stop = inProto.readFieldBegin();
            expect(stop.ftype).toBe(0);
            inProto.readStructEnd();
            apacheDecodedCount++;
          }
          inProto.readListEnd();
          expect(inProto.readFieldBegin().ftype).toBe(0);
          inProto.readStructEnd();
          expect(inProto.readFieldBegin().ftype).toBe(0);
          inProto.readStructEnd();
          inProto.readMessageEnd();
        })(Buffer.from(requestBytes));

        expect(apacheDecodedCount).toBe(itemCount);
        requestCapturedByApache = true;

        // 2. Apache Thrift encodes a BatchResponse into a binary buffer
        let apacheResponseBuffer!: Buffer;
        const outTransport = new TBufferedTransport(undefined, (buf: Buffer) => {
          apacheResponseBuffer = buf;
        });
        const outProto = new TBinaryProtocol(outTransport);

        outProto.writeMessageBegin("processBatch", 2, 1); // REPLY
        outProto.writeStructBegin("processBatch_result");
        outProto.writeFieldBegin("success", 12, 0);

        outProto.writeStructBegin("BatchResponse");
        outProto.writeFieldBegin("count", 8, 1);
        outProto.writeI32(itemCount);
        outProto.writeFieldEnd();

        outProto.writeFieldBegin("items", 15, 2);
        outProto.writeListBegin(12, itemCount);
        for (let i = 0; i < itemCount; i++) {
          outProto.writeStructBegin("Item");
          outProto.writeFieldBegin("id", 10, 1);
          outProto.writeI64(Number(10_000_000 + i));
          outProto.writeFieldEnd();

          outProto.writeFieldBegin("title", 11, 2);
          outProto.writeString(`Resp #${i}`);
          outProto.writeFieldEnd();

          outProto.writeFieldBegin("score", 4, 3);
          outProto.writeDouble(i * 2.0);
          outProto.writeFieldEnd();

          outProto.writeFieldBegin("tags", 14, 4);
          outProto.writeSetBegin(11, 1);
          outProto.writeString("active");
          outProto.writeSetEnd();
          outProto.writeFieldEnd();

          outProto.writeFieldBegin("meta", 13, 5);
          outProto.writeMapBegin(11, 8, 1);
          outProto.writeString("k");
          outProto.writeI32(i);
          outProto.writeMapEnd();
          outProto.writeFieldEnd();

          outProto.writeFieldStop();
          outProto.writeStructEnd();
        }
        outProto.writeListEnd();
        outProto.writeFieldEnd();
        outProto.writeFieldStop();
        outProto.writeStructEnd(); // BatchResponse

        outProto.writeFieldEnd();
        outProto.writeFieldStop();
        outProto.writeStructEnd(); // processBatch_result
        outProto.writeMessageEnd();
        outTransport.flush();

        return new Uint8Array(apacheResponseBuffer);
      },
    });

    const t0 = performance.now();
    const res = await client.processBatch({ items });
    const totalDuration = performance.now() - t0;
    const result = res;

    expect(requestCapturedByApache).toBe(true);
    expect(result.count).toBe(itemCount);
    expect(result.items.length).toBe(itemCount);
    expect(result.items[4999].id).toBe(10_004_999n);
    expect(result.items[4999].title).toBe("Resp #4999");
    expect(totalDuration).toBeLessThan(5000);
  });
});
