import { assertI64, numberToI64 } from "./i64.ts";
import { parseUuid } from "./uuid.ts";
import { assertInteger, assertMessageType, assertValueType, WireType } from "./wire.ts";

/** Writes unframed, big-endian Thrift Binary Protocol messages. */
export class BinaryWriter {
  private bytes: Uint8Array;
  private view: DataView;
  private offset = 0;

  constructor(private readonly maxBytes = 16 * 1024 * 1024) {
    assertInteger(maxBytes, 1, 2147483647);
    this.bytes = new Uint8Array(Math.min(256, maxBytes));
    this.view = new DataView(this.bytes.buffer);
  }

  private reserve(size: number): number {
    const end = this.offset + size;
    if (end > this.maxBytes) throw new RangeError("Binary message exceeds byte limit");
    if (end > this.bytes.length) {
      const next = new Uint8Array(Math.min(this.maxBytes, Math.max(end, this.bytes.length * 2)));
      next.set(this.bytes);
      this.bytes = next;
      this.view = new DataView(next.buffer);
    }
    const start = this.offset;
    this.offset = end;
    return start;
  }

  finish(): Uint8Array {
    return this.bytes.slice(0, this.offset);
  }

  writeBool(value: boolean): void {
    if (typeof value !== "boolean") throw new TypeError("Expected boolean");
    this.writeByte(value ? 1 : 0);
  }

  writeByte(value: number): void {
    assertInteger(value, -128, 127);
    const start = this.reserve(1);
    this.view.setInt8(start, value);
  }

  writeI16(value: number): void {
    assertInteger(value, -32768, 32767);
    const start = this.reserve(2);
    this.view.setInt16(start, value);
  }

  writeI32(value: number): void {
    assertInteger(value, -2147483648, 2147483647);
    const start = this.reserve(4);
    this.view.setInt32(start, value);
  }

  writeI64(value: bigint): void {
    assertI64(value);
    const start = this.reserve(8);
    this.view.setBigInt64(start, value);
  }

  writeI64Number(value: number): void {
    this.writeI64(numberToI64(value));
  }

  writeDouble(value: number): void {
    if (typeof value !== "number") throw new TypeError("Expected double");
    const start = this.reserve(8);
    this.view.setFloat64(start, value);
  }

  writeBinary(value: Uint8Array): void {
    assertInteger(value.byteLength, 0, 2147483647);
    const start = this.reserve(4 + value.byteLength);
    this.view.setInt32(start, value.byteLength);
    this.bytes.set(value, start + 4);
  }

  writeString(value: string): void {
    if (typeof value !== "string") throw new TypeError("Expected string");
    this.writeBinary(new TextEncoder().encode(value));
  }

  writeUuid(value: string): void {
    const start = this.reserve(16);
    parseUuid(value, this.bytes, start);
  }

  writeMessageBegin(name: string, type: number, sequenceId: number): void {
    assertMessageType(type);
    this.writeI32(-2147418112 | type);
    this.writeString(name);
    this.writeI32(sequenceId);
  }

  writeFieldBegin(type: number, id: number): void {
    assertValueType(type);
    this.writeByte(type);
    this.writeI16(id);
  }

  writeFieldStop(): void {
    this.writeByte(WireType.Stop);
  }

  writeMapBegin(keyType: number, valueType: number, size: number): void {
    assertValueType(keyType);
    assertValueType(valueType);
    assertInteger(size, 0, 2147483647);
    this.writeByte(keyType);
    this.writeByte(valueType);
    this.writeI32(size);
  }

  /** Lists and sets share the same binary header. */
  writeCollectionBegin(elementType: number, size: number): void {
    assertValueType(elementType);
    assertInteger(size, 0, 2147483647);
    this.writeByte(elementType);
    this.writeI32(size);
  }
}
