import type { BinaryReader } from "../runtime/binary-reader.ts";
import type { BinaryWriter } from "../runtime/binary-writer.ts";
import { WireType } from "../runtime/wire.ts";

/** Executable wire contract emitted by the compiler; no metadata lookup is needed. */
export interface Codec<T = any> {
  type: number;
  read(reader: BinaryReader, depth?: number): T;
  write(writer: BinaryWriter, value: T, depth?: number): void;
}

export function nextDepth(depth = 0): number {
  if (depth >= 64) throw new RangeError("Thrift value exceeds nesting limit");
  return depth + 1;
}

export const bool: Codec<boolean> = {
  type: WireType.Bool,
  read: (r) => r.readBool(),
  write: (w, v) => w.writeBool(v),
};
export const byte: Codec<number> = {
  type: WireType.Byte,
  read: (r) => r.readByte(),
  write: (w, v) => w.writeByte(v),
};
export const i16: Codec<number> = {
  type: WireType.I16,
  read: (r) => r.readI16(),
  write: (w, v) => w.writeI16(v),
};
export const i32: Codec<number> = {
  type: WireType.I32,
  read: (r) => r.readI32(),
  write: (w, v) => w.writeI32(v),
};
export const i64: Codec<bigint> = {
  type: WireType.I64,
  read: (r) => r.readI64(),
  write: (w, v) => w.writeI64(v),
};
export const i64Number: Codec<number> = {
  type: WireType.I64,
  read: (r) => r.readI64Number(),
  write: (w, v) => w.writeI64Number(v),
};
export const double: Codec<number> = {
  type: WireType.Double,
  read: (r) => r.readDouble(),
  write: (w, v) => w.writeDouble(v),
};
export const string: Codec<string> = {
  type: WireType.String,
  read: (r) => r.readString(),
  write: (w, v) => w.writeString(v),
};
export const binary: Codec<Uint8Array> = {
  type: WireType.String,
  read: (r) => r.readBinary(),
  write(w, v) {
    if (!(v instanceof Uint8Array)) throw new TypeError("Expected Uint8Array");
    w.writeBinary(v);
  },
};
