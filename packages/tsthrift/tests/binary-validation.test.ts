import { expect, test } from "vite-plus/test";
import { BinaryReader, BinaryWriter, WireType, i64ToNumber, numberToI64 } from "../src/runtime.ts";

test("checks public number conversion and signed i64 bounds without rounding", () => {
  for (const value of [Number.MIN_SAFE_INTEGER, -1, 0, 1, Number.MAX_SAFE_INTEGER]) {
    expect(i64ToNumber(numberToI64(value))).toBe(value);
    const writer = new BinaryWriter();
    writer.writeI64Number(value);
    expect(new BinaryReader(writer.finish()).readI64Number()).toBe(value);
  }
  for (const value of [NaN, Infinity, 1.5, 9007199254740992, -9007199254740992]) {
    expect(() => new BinaryWriter().writeI64Number(value)).toThrow(RangeError);
  }
  for (const value of [-(1n << 63n), (1n << 63n) - 1n]) {
    const writer = new BinaryWriter();
    writer.writeI64(value);
    expect(new BinaryReader(writer.finish()).readI64()).toBe(value);
    expect(() => new BinaryReader(writer.finish()).readI64Number()).toThrow("safe number range");
  }
  for (const value of [-(1n << 63n) - 1n, 1n << 63n]) {
    expect(() => new BinaryWriter().writeI64(value)).toThrow("signed i64");
  }
  expect(() => new BinaryWriter().writeI64(1 as unknown as bigint)).toThrow("signed i64");
});

test("rejects truncated scalar, string, field, collection, and message data", () => {
  const writer = new BinaryWriter();
  writer.writeMessageBegin("echo", 1, 1);
  const bytes = writer.finish();
  for (let size = 0; size < bytes.length; size++) {
    expect(() => new BinaryReader(bytes.subarray(0, size)).readMessageBegin()).toThrow();
  }
  expect(() => new BinaryReader(new Uint8Array(7)).readI64()).toThrow();
  expect(() => new BinaryReader(new Uint8Array([8, 0])).readFieldBegin()).toThrow();
  expect(() => new BinaryReader(new Uint8Array([8, 0, 0, 0])).readCollectionBegin()).toThrow();
  expect(() => new BinaryReader(new Uint8Array([0, 0, 0, 3, 1])).readBinary()).toThrow();
  expect(() => new BinaryReader(new Uint8Array([255, 255, 255, 255])).readBinary()).toThrow();
  expect(() =>
    new BinaryReader(new Uint8Array([255, 255, 255, 255])).skip(WireType.String),
  ).toThrow();
});

test("validates protocol versions, message types, and field/container types", () => {
  const writer = new BinaryWriter();
  writer.writeI32(-2147352575);
  expect(() => new BinaryReader(writer.finish()).readMessageBegin()).toThrow("protocol version");
  const invalidMessage = new BinaryWriter();
  invalidMessage.writeI32(-2147418112 | 5);
  invalidMessage.writeString("echo");
  invalidMessage.writeI32(1);
  expect(() => new BinaryReader(invalidMessage.finish()).readMessageBegin()).toThrow();
  expect(() => writer.writeMessageBegin("echo", 5, 1)).toThrow();
  expect(() => writer.writeFieldBegin(WireType.Stop, 1)).toThrow("value type");
  expect(() => writer.writeCollectionBegin(WireType.Stop, 0)).toThrow("value type");
  expect(() => writer.writeMapBegin(WireType.I32, 99, 0)).toThrow("value type");
  expect(() => new BinaryReader(new Uint8Array([99])).readFieldBegin()).toThrow("value type");
  expect(() => new BinaryReader(new Uint8Array([0, 0, 0, 0, 0])).readCollectionBegin()).toThrow(
    "value type",
  );
  expect(() => new BinaryReader(new Uint8Array()).skip(WireType.Stop)).toThrow("value type");
});

test("enforces message, collection, and skip-depth limits", () => {
  expect(() => new BinaryWriter(4).writeI64(1n)).toThrow("byte limit");
  expect(() => new BinaryReader(new Uint8Array(5), { maxBytes: 4 })).toThrow("byte limit");
  const writer = new BinaryWriter();
  writer.writeCollectionBegin(WireType.I32, 3);
  expect(() =>
    new BinaryReader(writer.finish(), { maxCollectionSize: 2 }).readCollectionBegin(),
  ).toThrow();
  const negative = new Uint8Array([8, 255, 255, 255, 255]);
  expect(() => new BinaryReader(negative).readCollectionBegin()).toThrow();
  expect(() => writer.writeCollectionBegin(WireType.I32, -1)).toThrow();
  const nested = new BinaryWriter();
  nested.writeCollectionBegin(WireType.List, 1);
  nested.writeCollectionBegin(WireType.I32, 1);
  nested.writeI32(1);
  expect(() => new BinaryReader(nested.finish(), { maxSkipDepth: 2 }).skip(WireType.List)).toThrow(
    "skip depth",
  );
  const reader = new BinaryReader(nested.finish(), { maxSkipDepth: 3 });
  reader.skip(WireType.List);
  reader.assertDone();
});

test("grows output safely and respects byte offsets and trailing bytes", () => {
  const text = "x".repeat(1000);
  const writer = new BinaryWriter(1100);
  writer.writeString(text);
  const bytes = writer.finish();
  const padded = new Uint8Array(bytes.length + 4);
  padded.set(bytes, 2);
  const reader = new BinaryReader(padded.subarray(2, -2));
  expect(reader.readString()).toBe(text);
  reader.assertDone();
  expect(() => new BinaryReader(padded.subarray(2)).assertDone()).toThrow("trailing bytes");
  writer.writeByte(1);
  expect(bytes.length).toBe(1004);
  expect(writer.finish().length).toBe(1005);
});

test("preserves IEEE double values and rejects narrowed integer overflow", () => {
  for (const value of [NaN, Infinity, -Infinity, -0, Number.MIN_VALUE]) {
    const writer = new BinaryWriter();
    writer.writeDouble(value);
    expect(new BinaryReader(writer.finish()).readDouble()).toBe(value);
  }
  const writer = new BinaryWriter();
  expect(() => writer.writeByte(128)).toThrow();
  expect(() => writer.writeI16(-32769)).toThrow();
  expect(() => writer.writeI32(2147483648)).toThrow();
  expect(() => writer.writeI32(0.5)).toThrow();
});
