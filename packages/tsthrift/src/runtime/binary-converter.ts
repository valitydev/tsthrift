export type BinaryEncoding = "utf8" | "base64" | "hex";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function isBinary(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array;
}

export function toBinary(
  input: Uint8Array | ArrayBuffer | string,
  encoding: BinaryEncoding = "utf8",
): Uint8Array {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (typeof input !== "string") {
    throw new TypeError("Expected Uint8Array, ArrayBuffer, or string");
  }

  if (encoding === "utf8") {
    return textEncoder.encode(input);
  }

  if (encoding === "hex") {
    const clean = input.replace(/\s+/g, "");
    if (clean.length % 2 !== 0) throw new TypeError("Invalid hex string length");
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < clean.length; i += 2) {
      const byte = Number.parseInt(clean.slice(i, i + 2), 16);
      if (Number.isNaN(byte)) throw new TypeError(`Invalid hex character at index ${i}`);
      bytes[i / 2] = byte;
    }
    return bytes;
  }

  if (encoding === "base64") {
    if (typeof Buffer !== "undefined") {
      return new Uint8Array(Buffer.from(input, "base64"));
    }
    const binaryStr = globalThis.atob(input);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
  }

  throw new TypeError(`Unsupported binary encoding: ${String(encoding)}`);
}

export function binaryToString(bytes: Uint8Array, encoding: BinaryEncoding = "utf8"): string {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("Expected Uint8Array");
  }

  if (encoding === "utf8") {
    return textDecoder.decode(bytes);
  }

  if (encoding === "hex") {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  if (encoding === "base64") {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
    }
    let binaryStr = "";
    for (let i = 0; i < bytes.length; i++) {
      binaryStr += String.fromCharCode(bytes[i]!);
    }
    return globalThis.btoa(binaryStr);
  }

  throw new TypeError(`Unsupported binary encoding: ${String(encoding)}`);
}
