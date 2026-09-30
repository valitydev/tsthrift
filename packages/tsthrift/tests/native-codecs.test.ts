import { expect, test } from "vite-plus/test";
import { BinaryReader, BinaryWriter } from "../src/runtime.ts";
import { type Codec, i32, string } from "../src/codecs/scalar.ts";
import { list, map } from "../src/codecs/collections.ts";
import { struct } from "../src/codecs/struct.ts";

const required = struct("Required", () => [{ id: 1, name: "id", codec: i32, required: true }]);

test("rejects absent required fields and duplicate decoded fields", () => {
  expect(() => required.read(new BinaryReader(new Uint8Array([0])))).toThrow(/required/);
  const writer = new BinaryWriter();
  for (let i = 0; i < 2; i++) {
    writer.writeFieldBegin(8, 1);
    writer.writeI32(i);
  }
  writer.writeFieldStop();
  expect(() => required.read(new BinaryReader(writer.finish()))).toThrow(/Duplicate field/);
});

test("skips an incompatible field without assigning the wrong public value", () => {
  const writer = new BinaryWriter();
  writer.writeFieldBegin(11, 1);
  writer.writeString("wrong type");
  writer.writeFieldStop();
  expect(() => required.read(new BinaryReader(writer.finish()))).toThrow(/required/);
});

test("rejects mismatched container element types and truncated collections", () => {
  const writer = new BinaryWriter();
  writer.writeCollectionBegin(11, 0);
  expect(() => list(i32).read(new BinaryReader(writer.finish()))).toThrow(/type mismatch/);
  const truncated = new BinaryWriter();
  truncated.writeMapBegin(11, 8, 1);
  truncated.writeString("a");
  expect(() => map(string, i32).read(new BinaryReader(truncated.finish()))).toThrow();
});

test("limits recursion in known fields on both read and write", () => {
  const node: Codec = struct("Node", () => [{ id: 1, name: "next", codec: node }]);
  const cyclic: Record<string, unknown> = {};
  cyclic.next = cyclic;
  expect(() => node.write(new BinaryWriter(), cyclic)).toThrow(/nesting limit/);
  const writer = new BinaryWriter();
  for (let i = 0; i < 65; i++) writer.writeFieldBegin(12, 1);
  for (let i = 0; i < 66; i++) writer.writeFieldStop();
  expect(() => node.read(new BinaryReader(writer.finish()))).toThrow(/nesting limit/);
});

test("keeps defaults independent and preserves prototype-named fields as data", () => {
  const codec = struct("Fields", () => [
    { id: 1, name: "__proto__", codec: string },
    { id: 2, name: "items", codec: list(i32), defaultValue: () => [] },
  ]);
  const writer = new BinaryWriter();
  codec.write(writer, { ["__proto__"]: "safe" });
  const first = codec.read(new BinaryReader(writer.finish()));
  const second = codec.read(new BinaryReader(writer.finish()));
  first.items.push(1);
  expect(second.items).toEqual([]);
  expect(Object.getPrototypeOf(first)).toBe(Object.prototype);
  expect(first.__proto__).toBe("safe");
});
