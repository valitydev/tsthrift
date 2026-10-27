import { expect, test } from "vite-plus/test";
import { BinaryReader, BinaryWriter } from "../src/runtime.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Deterministic pseudo-random numbers keep failures reproducible. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const alphabets = [
  "abcdefghijklmnopqrstuvwxyz0123456789 -_./",
  "abc\u0000\u007f\u0080߿ࠀ￿",
  "😀👍🙂",
  "aé中😀",
];

function strings(): string[] {
  const next = random(7);
  const values = [
    "",
    "a",
    "\u0000",
    "é",
    "中",
    "😀",
    "a".repeat(64),
    "a".repeat(65),
    "é".repeat(64),
    "a".repeat(63) + "😀",
    "Оплата заказа №12345",
    // Three UTF-8 bytes per UTF-16 unit fill the whole `encodeInto` reservation.
    "中".repeat(4096),
    "中".repeat(4097),
  ];
  for (const length of [1, 2, 31, 63, 64, 65, 66, 100, 1365, 1366, 4096, 4097, 10_000]) {
    for (const alphabet of alphabets) {
      // Code points, so surrogate pairs stay intact.
      const units = Array.from(alphabet);
      values.push(Array.from({ length }, () => units[Math.floor(next() * units.length)]!).join(""));
    }
  }
  return values;
}

/** Unpaired surrogates encode as U+FFFD, so they do not round-trip and are compared by bytes. */
const unpaired = ["\uD800", "a\uDC00b", "\uD800".repeat(100), "x".repeat(99) + "\uD83D"];

test("writes the same bytes as TextEncoder for ASCII, BMP, and astral strings", () => {
  for (const value of [...strings(), ...unpaired]) {
    const writer = new BinaryWriter();
    writer.writeString(value);
    const encoded = encoder.encode(value);
    const bytes = writer.finish();
    expect(bytes.byteLength).toBe(4 + encoded.byteLength);
    expect(new DataView(bytes.buffer).getInt32(0)).toBe(encoded.byteLength);
    expect(bytes.subarray(4)).toEqual(encoded);
  }
});

test("reads the same strings as TextDecoder, including malformed UTF-8", () => {
  const next = random(11);
  for (const length of [0, 1, 5, 12, 13, 14, 63, 64, 65, 200]) {
    for (let round = 0; round < 50; round++) {
      const payload = Uint8Array.from({ length }, () =>
        round % 2 ? Math.floor(next() * 256) : Math.floor(next() * 128),
      );
      const writer = new BinaryWriter();
      writer.writeBinary(payload);
      expect(new BinaryReader(writer.finish()).readString()).toBe(decoder.decode(payload));
    }
  }
});

test("round-trips strings and keeps following values aligned", () => {
  const writer = new BinaryWriter();
  for (const value of strings()) {
    writer.writeString(value);
    writer.writeI32(value.length);
  }
  const reader = new BinaryReader(writer.finish());
  for (const value of strings()) {
    expect(reader.readString()).toBe(value);
    expect(reader.readI32()).toBe(value.length);
  }
  reader.assertDone();
});

test("still enforces the byte limit for strings near the maximum", () => {
  const writer = new BinaryWriter(16);
  expect(() => writer.writeString("a".repeat(13))).toThrow(RangeError);
  const fits = new BinaryWriter(16);
  fits.writeString("a".repeat(12));
  expect(fits.finish().byteLength).toBe(16);
  const wide = new BinaryWriter(16);
  expect(() => wide.writeString("é".repeat(7))).toThrow(RangeError);
  // The worst-case reservation exceeds the limit, but the encoded string fits.
  const wideFits = new BinaryWriter(16);
  wideFits.writeString("é".repeat(6));
  expect(wideFits.finish().byteLength).toBe(16);
  const long = new BinaryWriter(100);
  long.writeString("a".repeat(80));
  expect(long.finish().byteLength).toBe(84);
  expect(() => new BinaryWriter(100).writeString("é".repeat(49))).toThrow(RangeError);
});
