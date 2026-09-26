const minI64 = -(1n << 63n);
const maxI64 = (1n << 63n) - 1n;

export function assertI64(value: bigint): void {
  if (typeof value !== "bigint" || value < minI64 || value > maxI64) {
    throw new RangeError(`Expected signed i64 bigint, got ${String(value)}`);
  }
}

export function numberToI64(value: number): bigint {
  if (!Number.isSafeInteger(value)) throw new RangeError(`Unsafe i64 number: ${value}`);
  return BigInt(value);
}

export function i64ToNumber(value: bigint): number {
  assertI64(value);
  const result = Number(value);
  if (!Number.isSafeInteger(result))
    throw new RangeError(`i64 exceeds safe number range: ${value}`);
  return result;
}
