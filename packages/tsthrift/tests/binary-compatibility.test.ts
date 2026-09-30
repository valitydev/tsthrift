import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { expect, test } from "vite-plus/test";
import { BinaryReader, BinaryWriter, MessageType, WireType } from "../src/runtime.ts";

const execute = promisify(execFile);
const limits = [-(1n << 63n), -9007199254740991n, -1n, 0n, 1n, 9007199254740991n, (1n << 63n) - 1n];

async function reference(request: object): Promise<string> {
  const { stdout } = await execute(process.execPath, [
    path.join(import.meta.dirname, "reference/apache-binary.cjs"),
    JSON.stringify(request),
  ]);
  return stdout;
}

test("cross-decodes primitives, headers, and full-range i64 with Apache 0.24", async () => {
  const writer = new BinaryWriter();
  writer.writeMessageBegin("echo", MessageType.Call, -7);
  writer.writeFieldBegin(WireType.List, 1);
  writer.writeCollectionBegin(WireType.I64, limits.length);
  for (const value of limits) writer.writeI64(value);
  writer.writeFieldBegin(WireType.Struct, 2);
  writer.writeFieldStop();
  writer.writeFieldStop();
  // Primitive suffix is a separate protocol value stream for coverage.
  writer.writeBool(true);
  writer.writeBool(false);
  writer.writeByte(-128);
  writer.writeI16(-32768);
  writer.writeI32(-2147483648);
  writer.writeDouble(-1.25);
  writer.writeString("Привет 🌍\0");
  writer.writeBinary(new Uint8Array([0, 127, 128, 255]));
  const operations = [
    ["writeMessageBegin", "echo", 1, -7],
    ["writeFieldBegin", "values", 15, 1],
    ["writeListBegin", 10, limits.length],
    ...limits.map((value) => ["writeI64", String(value)]),
    ["writeFieldBegin", "empty", 12, 2],
    ["writeFieldStop"],
    ["writeFieldStop"],
    ["writeBool", true],
    ["writeBool", false],
    ["writeByte", -128],
    ["writeI16", -32768],
    ["writeI32", -2147483648],
    ["writeDouble", -1.25],
    ["writeString", "Привет 🌍\0"],
    ["writeBinary", [0, 127, 128, 255]],
  ];
  const encoded = await reference({ mode: "encode", operations });
  expect(Buffer.from(writer.finish()).toString("base64")).toBe(encoded);
  const reader = new BinaryReader(Buffer.from(encoded, "base64"));
  expect(reader.readMessageBegin()).toEqual({ name: "echo", type: 1, sequenceId: -7 });
  expect(reader.readFieldBegin()).toEqual({ type: 15, id: 1 });
  expect(reader.readCollectionBegin()).toEqual({ elementType: 10, size: limits.length });
  expect(limits.map(() => reader.readI64())).toEqual(limits);
  expect(reader.readFieldBegin()).toEqual({ type: 12, id: 2 });
  expect(reader.readFieldBegin().type).toBe(0);
  expect(reader.readFieldBegin().type).toBe(0);
  const suffix = [
    reader.readBool(),
    reader.readBool(),
    reader.readByte(),
    reader.readI16(),
    reader.readI32(),
    reader.readDouble(),
    reader.readString(),
    [...reader.readBinary()],
  ];
  expect(suffix).toEqual([
    true,
    false,
    -128,
    -32768,
    -2147483648,
    -1.25,
    "Привет 🌍\0",
    [0, 127, 128, 255],
  ]);
  reader.assertDone();
  const decoded = JSON.parse(
    await reference({
      mode: "decode",
      bytes: Buffer.from(writer.finish()).toString("base64"),
      operations: [
        ["readMessageBegin"],
        ["readFieldBegin"],
        ["readListBegin"],
        ...limits.map(() => ["readI64"]),
        ["readFieldBegin"],
        ["readFieldBegin"],
        ["readFieldBegin"],
        ["readBool"],
        ["readBool"],
        ["readByte"],
        ["readI16"],
        ["readI32"],
        ["readDouble"],
        ["readString"],
        ["readBinary"],
      ],
    }),
  );
  expect(decoded).toEqual([
    { fname: "echo", mtype: 1, rseqid: -7 },
    { fname: null, ftype: 15, fid: 1 },
    { etype: 10, size: limits.length },
    ...limits.map(String),
    { fname: null, ftype: 12, fid: 2 },
    { fname: null, ftype: 0, fid: 0 },
    { fname: null, ftype: 0, fid: 0 },
    ...suffix,
  ]);
});

test("skips nested struct-keyed maps and sets from Apache without losing the next field", async () => {
  const operations = [
    ["writeFieldBegin", "unknown", 13, 99],
    ["writeMapBegin", 12, 14, 1],
    ["writeFieldBegin", "id", 8, 1],
    ["writeI32", 42],
    ["writeFieldStop"],
    ["writeSetBegin", 11, 2],
    ["writeString", "a"],
    ["writeString", "b"],
    ["writeFieldBegin", "known", 10, 1],
    ["writeI64", "42"],
    ["writeFieldStop"],
  ];
  const encoded = await reference({ mode: "encode", operations });
  const reader = new BinaryReader(Buffer.from(encoded, "base64"));
  reader.skip(reader.readFieldBegin().type);
  expect(reader.readFieldBegin()).toEqual({ type: 10, id: 1 });
  expect(reader.readI64Number()).toBe(42);
  expect(reader.readFieldBegin().type).toBe(0);
  reader.assertDone();

  const writer = new BinaryWriter();
  writer.writeFieldBegin(WireType.Map, 99);
  writer.writeMapBegin(WireType.Struct, WireType.Set, 1);
  writer.writeFieldBegin(WireType.I32, 1);
  writer.writeI32(42);
  writer.writeFieldStop();
  writer.writeCollectionBegin(WireType.String, 2);
  writer.writeString("a");
  writer.writeString("b");
  writer.writeFieldBegin(WireType.I64, 1);
  writer.writeI64Number(42);
  writer.writeFieldStop();
  expect(Buffer.from(writer.finish()).toString("base64")).toBe(encoded);
  expect(
    JSON.parse(await reference({ mode: "decode", bytes: encoded, operations: [["skip", 12]] })),
  ).toEqual([null]);
});

test("reads legacy Apache envelopes only when explicitly enabled", async () => {
  const encoded = await reference({
    mode: "encode",
    strictWrite: false,
    operations: [["writeMessageBegin", "echo", 2, 17]],
  });
  const bytes = Buffer.from(encoded, "base64");
  expect(() => new BinaryReader(bytes).readMessageBegin()).toThrow(
    "Missing binary protocol version",
  );
  const reader = new BinaryReader(bytes, { strictRead: false });
  expect(reader.readMessageBegin()).toEqual({ name: "echo", type: 2, sequenceId: 17 });
  reader.assertDone();
});
