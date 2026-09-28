import { parse as uuidParse, stringify as uuidStringify, validate as uuidValidate } from "uuid";

/** Returns true if value is a valid canonical RFC 4122 UUID string. */
export function isUuid(value: string): boolean {
  return typeof value === "string" && uuidValidate(value);
}

/** Formats 16 bytes starting at offset into a canonical lowercase UUID string. */
export function formatUuid(bytes: Uint8Array, offset = 0): string {
  if (offset + 16 > bytes.byteLength) {
    throw new RangeError("Buffer too small for UUID (expected 16 bytes)");
  }
  return uuidStringify(bytes, offset);
}

/** Parses a canonical UUID string into 16 raw bytes written to target at offset. */
export function parseUuid(value: string, target: Uint8Array, offset = 0): void {
  if (offset + 16 > target.byteLength) {
    throw new RangeError("Buffer too small for UUID (expected 16 bytes)");
  }
  const parsed = uuidParse(value);
  target.set(parsed, offset);
}
