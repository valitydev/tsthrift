import { describe, expect, test } from "vite-plus/test";
import { binaryToString, isBinary, toBinary } from "../src/index.ts";

describe("binary-converter", () => {
  test("identifies Uint8Array correctly", () => {
    expect(isBinary(new Uint8Array([1, 2, 3]))).toBe(true);
    expect(isBinary([1, 2, 3])).toBe(false);
    expect(isBinary("hello")).toBe(false);
    expect(isBinary(null)).toBe(false);
  });

  test("converts string to utf8 Uint8Array and back", () => {
    const text = "Hello world! Привет мир! 🌍";
    const bytes = toBinary(text);
    expect(isBinary(bytes)).toBe(true);
    expect(binaryToString(bytes)).toBe(text);
  });

  test("converts hex string to Uint8Array and back", () => {
    const hex = "deadbeef010203";
    const bytes = toBinary(hex, "hex");
    expect(bytes).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02, 0x03]));
    expect(binaryToString(bytes, "hex")).toBe(hex);
  });

  test("converts base64 string to Uint8Array and back", () => {
    const text = "Thrift binary payload test 12345";
    const utf8Bytes = toBinary(text);
    const base64 = binaryToString(utf8Bytes, "base64");
    const restoredBytes = toBinary(base64, "base64");
    expect(restoredBytes).toEqual(utf8Bytes);
    expect(binaryToString(restoredBytes, "utf8")).toBe(text);
  });

  test("passes through existing Uint8Array unchanged", () => {
    const original = new Uint8Array([1, 2, 3, 4]);
    expect(toBinary(original)).toBe(original);
  });

  test("converts ArrayBuffer to Uint8Array", () => {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setUint8(0, 42);
    const bytes = toBinary(buffer);
    expect(isBinary(bytes)).toBe(true);
    expect(bytes[0]).toBe(42);
  });

  test("rejects invalid hex strings", () => {
    expect(() => toBinary("abc", "hex")).toThrow(TypeError);
    expect(() => toBinary("zz", "hex")).toThrow(TypeError);
  });
});
