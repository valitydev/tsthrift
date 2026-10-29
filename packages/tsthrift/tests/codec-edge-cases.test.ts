import { expect, test } from "vite-plus/test";
import { createMetadataClient } from "../src/index.ts";
import { i32, string } from "../src/codecs/scalar.ts";
import { struct } from "../src/codecs/struct.ts";
import { BinaryReader, BinaryWriter, MessageType } from "../src/runtime.ts";
import type { Metadata } from "../src/metadata/types.ts";

test("decodes fields named like Object.prototype members as own data properties", () => {
  const codec = struct("S", () => [
    { id: 1, name: "__proto__", codec: string },
    { id: 2, name: "constructor", codec: string },
    { id: 3, name: "hasOwnProperty", codec: i32 },
    { id: 4, name: "toString", codec: string, defaultValue: () => "default" },
  ]);
  const writer = new BinaryWriter();
  codec.write(writer, { constructor: "c", hasOwnProperty: 3 });
  const decoded = codec.read(new BinaryReader(writer.finish()));
  expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype);
  expect(Object.keys(decoded)).toEqual(["constructor", "hasOwnProperty", "toString"]);
  expect(decoded).toEqual({ constructor: "c", hasOwnProperty: 3, toString: "default" });

  const proto = new BinaryWriter();
  proto.writeFieldBegin(11, 1);
  proto.writeString("polluted");
  proto.writeFieldStop();
  const result = codec.read(new BinaryReader(proto.finish()));
  expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  expect(Object.getOwnPropertyDescriptor(result, "__proto__")?.value).toBe("polluted");
  expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
});

test("keeps wire order for decoded keys and still rejects duplicates", () => {
  const codec = struct("S", () => [
    { id: 1, name: "a", codec: i32 },
    { id: 2, name: "b", codec: i32 },
    { id: 3, name: "c", codec: i32, defaultValue: () => 0 },
  ]);
  const writer = new BinaryWriter();
  writer.writeFieldBegin(8, 2);
  writer.writeI32(2);
  writer.writeFieldBegin(8, 1);
  writer.writeI32(1);
  writer.writeFieldStop();
  expect(Object.keys(codec.read(new BinaryReader(writer.finish())))).toEqual(["b", "a", "c"]);

  const duplicate = new BinaryWriter();
  for (let i = 0; i < 2; i++) {
    duplicate.writeFieldBegin(8, 1);
    duplicate.writeI32(i);
  }
  duplicate.writeFieldStop();
  expect(() => codec.read(new BinaryReader(duplicate.finish()))).toThrow(/Duplicate field S.a/);
});

const metadata = (): Metadata[] => [
  {
    name: "example",
    path: "example.thrift",
    ast: {
      service: {
        Example: {
          functions: {
            Echo: {
              name: "Echo",
              type: "void",
              args: [
                { id: 1, name: "__proto__", type: "string" },
                { id: 2, name: "constructor", type: "i32" },
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

function reply(request: Uint8Array): Uint8Array {
  const header = new BinaryReader(request).readMessageBegin();
  const writer = new BinaryWriter();
  writer.writeMessageBegin(header.name, MessageType.Reply, header.sequenceId);
  writer.writeFieldStop();
  return writer.finish();
}

test("sends arguments named like Object.prototype members", async () => {
  const seen: unknown[] = [];
  const client = await createMetadataClient<{ Echo(a: string, b: number): Promise<void> }>({
    metadata: metadata(),
    namespace: "example",
    serviceName: "Example",
    endpoint: "unused",
    transport: async (request) => {
      const reader = new BinaryReader(request);
      reader.readMessageBegin();
      expect(reader.readFieldBegin()).toEqual({ type: 11, id: 1 });
      seen.push(reader.readString());
      expect(reader.readFieldBegin()).toEqual({ type: 8, id: 2 });
      seen.push(reader.readI32());
      return reply(request);
    },
  });
  await client.Echo("proto-value", 7);
  expect(seen).toEqual(["proto-value", 7]);
});
