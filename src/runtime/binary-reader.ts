import { i64ToNumber } from "./i64.ts";
import { skipValue } from "./skip-value.ts";
import { assertInteger, assertMessageType, assertValueType, WireType } from "./wire.ts";

export interface BinaryReaderOptions {
  maxBytes?: number;
  maxCollectionSize?: number;
  maxSkipDepth?: number;
  strictRead?: boolean;
}

/** Reads one complete unframed message; streaming belongs to the transport. */
export class BinaryReader {
  private readonly view: DataView;
  private offset = 0;
  private readonly maxCollectionSize: number;
  private readonly maxSkipDepth: number;
  private readonly strictRead: boolean;

  constructor(
    private readonly bytes: Uint8Array,
    options: BinaryReaderOptions = {},
  ) {
    const maxBytes = options.maxBytes ?? 16 * 1024 * 1024;
    this.maxCollectionSize = options.maxCollectionSize ?? 1_000_000;
    this.maxSkipDepth = options.maxSkipDepth ?? 64;
    this.strictRead = options.strictRead ?? true;
    assertInteger(maxBytes, 1, 2147483647);
    assertInteger(this.maxCollectionSize, 0, 2147483647);
    assertInteger(this.maxSkipDepth, 1, 256);
    if (bytes.byteLength > maxBytes) throw new RangeError("Binary message exceeds byte limit");
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  private take(size: number): number {
    assertInteger(size, 0, this.bytes.byteLength);
    if (size > this.bytes.byteLength - this.offset)
      throw new RangeError("Truncated binary message");
    const start = this.offset;
    this.offset += size;
    return start;
  }

  get remaining(): number {
    return this.bytes.byteLength - this.offset;
  }

  assertDone(): void {
    if (this.remaining !== 0) throw new Error(`Unexpected trailing bytes: ${this.remaining}`);
  }

  readBool(): boolean {
    return this.readByte() !== 0;
  }
  readByte(): number {
    return this.view.getInt8(this.take(1));
  }
  readI16(): number {
    return this.view.getInt16(this.take(2));
  }
  readI32(): number {
    return this.view.getInt32(this.take(4));
  }
  readI64(): bigint {
    return this.view.getBigInt64(this.take(8));
  }
  readI64Number(): number {
    return i64ToNumber(this.readI64());
  }
  readDouble(): number {
    return this.view.getFloat64(this.take(8));
  }

  readBinary(): Uint8Array {
    const size = this.readI32();
    const start = this.take(size);
    return this.bytes.slice(start, start + size);
  }

  readString(): string {
    return new TextDecoder().decode(this.readBinary());
  }

  readMessageBegin(): { name: string; type: number; sequenceId: number } {
    const header = this.readI32();
    let name: string;
    let type: number;
    if (header < 0) {
      if ((header & -65536) !== -2147418112) throw new Error("Unsupported binary protocol version");
      type = header & 255;
      name = this.readString();
    } else {
      if (this.strictRead) throw new Error("Missing binary protocol version");
      const start = this.take(header);
      name = new TextDecoder().decode(this.bytes.subarray(start, start + header));
      type = this.readByte();
    }
    assertMessageType(type);
    return { name, type, sequenceId: this.readI32() };
  }

  readFieldBegin(): { type: number; id: number } {
    const type = this.readByte();
    if (type === WireType.Stop) return { type, id: 0 };
    assertValueType(type);
    return { type, id: this.readI16() };
  }

  private readSize(): number {
    const size = this.readI32();
    assertInteger(size, 0, this.maxCollectionSize);
    return size;
  }

  readMapBegin(): { keyType: number; valueType: number; size: number } {
    const keyType = this.readByte();
    const valueType = this.readByte();
    assertValueType(keyType);
    assertValueType(valueType);
    return { keyType, valueType, size: this.readSize() };
  }

  readCollectionBegin(): { elementType: number; size: number } {
    const elementType = this.readByte();
    assertValueType(elementType);
    return { elementType, size: this.readSize() };
  }

  skip(type: number): void {
    skipValue(this, type, this.maxSkipDepth);
  }

  /** Advance without allocating when skipping binary or fixed-width data. */
  skipBytes(size: number): void {
    this.take(size);
  }
}
