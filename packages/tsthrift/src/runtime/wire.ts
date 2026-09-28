export const WireType = {
  Stop: 0,
  Bool: 2,
  Byte: 3,
  Double: 4,
  I16: 6,
  I32: 8,
  I64: 10,
  String: 11,
  Struct: 12,
  Map: 13,
  Set: 14,
  List: 15,
  Uuid: 16,
} as const;

export type WireTypeValue = (typeof WireType)[keyof typeof WireType];

export const MessageType = { Call: 1, Reply: 2, Exception: 3, Oneway: 4 } as const;

export type MessageTypeValue = (typeof MessageType)[keyof typeof MessageType];

/** Thrift Binary Protocol version 1 identifier (0x80010000 in signed 32-bit int). */
export const BINARY_VERSION_1 = -2147418112;

/** Thrift Binary Protocol version mask (0xffff0000 in signed 32-bit int). */
export const BINARY_VERSION_MASK = -65536;

/** Default maximum nesting depth for Thrift values and metadata resolution. */
export const DEFAULT_MAX_DEPTH = 64;

/** Default maximum message size in bytes (16 MB). */
export const DEFAULT_MAX_BYTES = 16 * 1024 * 1024;

/** Default maximum collection item count (1,000,000). */
export const DEFAULT_MAX_COLLECTION_SIZE = 1_000_000;

const valueTypes = new Set<number>(
  Object.values(WireType).filter((type) => type !== WireType.Stop),
);

export function assertValueType(type: number): void {
  if (!valueTypes.has(type)) throw new Error(`Invalid Thrift value type: ${type}`);
}

export function assertInteger(value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`Expected integer in [${min}, ${max}], got ${value}`);
  }
}

export function assertMessageType(type: number): void {
  assertInteger(type, MessageType.Call, MessageType.Oneway);
}
