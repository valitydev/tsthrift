import type { BinaryReader } from "./binary-reader.ts";
import { WireType, type WireTypeValue } from "./wire.ts";

const widths: Readonly<Partial<Record<WireTypeValue, number>>> = {
  [WireType.Bool]: 1,
  [WireType.Byte]: 1,
  [WireType.I16]: 2,
  [WireType.I32]: 4,
  [WireType.I64]: 8,
  [WireType.Double]: 8,
  [WireType.Uuid]: 16,
};

export function skipValue(reader: BinaryReader, type: number, depth: number): void {
  if (depth <= 0) throw new RangeError("Maximum skip depth exceeded");
  const width = widths[type as WireTypeValue];
  if (width !== undefined) {
    reader.skipBytes(width);
  } else if (type === WireType.String) {
    reader.skipBytes(reader.readI32());
  } else if (type === WireType.Struct) {
    for (
      let field = reader.readFieldBegin();
      field.type !== WireType.Stop;
      field = reader.readFieldBegin()
    ) {
      skipValue(reader, field.type, depth - 1);
    }
  } else if (type === WireType.Map) {
    const { keyType, valueType, size } = reader.readMapBegin();
    for (let i = 0; i < size; i++) {
      skipValue(reader, keyType, depth - 1);
      skipValue(reader, valueType, depth - 1);
    }
  } else if (type === WireType.List || type === WireType.Set) {
    const { elementType, size } = reader.readCollectionBegin();
    for (let i = 0; i < size; i++) skipValue(reader, elementType, depth - 1);
  } else {
    throw new Error(`Invalid Thrift value type: ${type}`);
  }
}
