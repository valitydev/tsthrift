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

export const MessageType = { Call: 1, Reply: 2, Exception: 3, Oneway: 4 } as const;

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
