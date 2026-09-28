const UUID_REGEX =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/i;

const BYTE_TO_HEX: string[] = [];
for (let i = 0; i < 256; ++i) {
  BYTE_TO_HEX.push((i + 0x100).toString(16).slice(1));
}

/** Returns true if value is a valid canonical RFC 4122 UUID string. */
export function isUuid(value: string): boolean {
  return typeof value === "string" && UUID_REGEX.test(value);
}

/** Formats 16 bytes starting at offset into a canonical lowercase UUID string. */
export function formatUuid(bytes: Uint8Array, offset = 0): string {
  if (offset + 16 > bytes.byteLength) {
    throw new RangeError("Buffer too small for UUID (expected 16 bytes)");
  }
  return (
    BYTE_TO_HEX[bytes[offset]] +
    BYTE_TO_HEX[bytes[offset + 1]] +
    BYTE_TO_HEX[bytes[offset + 2]] +
    BYTE_TO_HEX[bytes[offset + 3]] +
    "-" +
    BYTE_TO_HEX[bytes[offset + 4]] +
    BYTE_TO_HEX[bytes[offset + 5]] +
    "-" +
    BYTE_TO_HEX[bytes[offset + 6]] +
    BYTE_TO_HEX[bytes[offset + 7]] +
    "-" +
    BYTE_TO_HEX[bytes[offset + 8]] +
    BYTE_TO_HEX[bytes[offset + 9]] +
    "-" +
    BYTE_TO_HEX[bytes[offset + 10]] +
    BYTE_TO_HEX[bytes[offset + 11]] +
    BYTE_TO_HEX[bytes[offset + 12]] +
    BYTE_TO_HEX[bytes[offset + 13]] +
    BYTE_TO_HEX[bytes[offset + 14]] +
    BYTE_TO_HEX[bytes[offset + 15]]
  );
}

/** Parses a canonical UUID string into 16 raw bytes written to target at offset. */
export function parseUuid(value: string, target: Uint8Array, offset = 0): void {
  if (offset + 16 > target.byteLength) {
    throw new RangeError("Buffer too small for UUID (expected 16 bytes)");
  }
  if (!isUuid(value)) {
    throw new TypeError(`Expected valid UUID string, got: ${String(value)}`);
  }
  let v: number;
  target[offset] = (v = parseInt(value.slice(0, 8), 16)) >>> 24;
  target[offset + 1] = (v >>> 16) & 0xff;
  target[offset + 2] = (v >>> 8) & 0xff;
  target[offset + 3] = v & 0xff;

  target[offset + 4] = (v = parseInt(value.slice(9, 13), 16)) >>> 8;
  target[offset + 5] = v & 0xff;

  target[offset + 6] = (v = parseInt(value.slice(14, 18), 16)) >>> 8;
  target[offset + 7] = v & 0xff;

  target[offset + 8] = (v = parseInt(value.slice(19, 23), 16)) >>> 8;
  target[offset + 9] = v & 0xff;

  v = parseInt(value.slice(24, 36), 16);
  target[offset + 10] = (v / 0x10000000000) & 0xff;
  target[offset + 11] = (v / 0x100000000) & 0xff;
  target[offset + 12] = (v >>> 24) & 0xff;
  target[offset + 13] = (v >>> 16) & 0xff;
  target[offset + 14] = (v >>> 8) & 0xff;
  target[offset + 15] = v & 0xff;
}
