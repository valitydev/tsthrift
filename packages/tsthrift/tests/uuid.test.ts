import { describe, expect, test } from "vite-plus/test";
import { parse as npmUuidParse, stringify as npmUuidStringify, v4 as uuidv4 } from "uuid";
import {
  BinaryReader,
  BinaryWriter,
  WireType,
  formatUuid,
  isUuid,
  parseUuid,
} from "../src/index.ts";
import { uuid as uuidCodec } from "../src/codecs/scalar.ts";
import { MetadataCodecs } from "../src/metadata/codecs.ts";
import { MetadataIndex } from "../src/metadata/index.ts";

describe("UUID Runtime & Codec Support", () => {
  const sampleUuid = "123e4567-e89b-12d3-a456-426614174000";
  const upperUuid = "123E4567-E89B-12D3-A456-426614174000";

  test("isUuid validation", () => {
    expect(isUuid(sampleUuid)).toBe(true);
    expect(isUuid(upperUuid)).toBe(true);
    expect(isUuid(uuidv4())).toBe(true);

    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("123e4567-e89b-12d3-a456-42661417400")).toBe(false); // 35 chars
    expect(isUuid("123e4567-e89b-12d3-a456-4266141740000")).toBe(false); // 37 chars
    expect(isUuid("123e4567e89b12d3a456426614174000")).toBe(false); // no hyphens
    expect(isUuid("123g4567-e89b-12d3-a456-426614174000")).toBe(false); // invalid hex 'g'
    expect(isUuid(null as any)).toBe(false);
    expect(isUuid(123 as any)).toBe(false);
  });

  test("parseUuid and formatUuid roundtrip matches canonical lowercase", () => {
    const bytes = new Uint8Array(16);
    parseUuid(upperUuid, bytes);
    expect(formatUuid(bytes)).toBe(sampleUuid);

    const npmBytes = npmUuidParse(sampleUuid);
    expect(Array.from(bytes)).toEqual(Array.from(npmBytes));
    expect(formatUuid(npmBytes)).toBe(sampleUuid);
    expect(npmUuidStringify(bytes)).toBe(sampleUuid);
  });

  test("parseUuid throws on invalid input or small buffer", () => {
    const bytes = new Uint8Array(16);
    expect(() => parseUuid("invalid", bytes)).toThrow(TypeError);
    expect(() => parseUuid(sampleUuid, new Uint8Array(10))).toThrow(RangeError);
  });

  test("formatUuid throws on truncated buffer", () => {
    expect(() => formatUuid(new Uint8Array(15))).toThrow(RangeError);
  });

  test("BinaryWriter.writeUuid and BinaryReader.readUuid", () => {
    const writer = new BinaryWriter();
    writer.writeUuid(sampleUuid);
    const encoded = writer.finish();
    expect(encoded.byteLength).toBe(16);

    const reader = new BinaryReader(encoded);
    expect(reader.readUuid()).toBe(sampleUuid);
    reader.assertDone();
  });

  test("scalar.uuid codec operates with WireType.Uuid (16)", () => {
    expect(uuidCodec.type).toBe(WireType.Uuid);
    expect(uuidCodec.type).toBe(16);

    const writer = new BinaryWriter();
    uuidCodec.write(writer, sampleUuid);
    const encoded = writer.finish();

    const reader = new BinaryReader(encoded);
    const decoded = uuidCodec.read(reader);
    expect(decoded).toBe(sampleUuid);
  });

  test("MetadataCodecs handles uuid field in structs and defaults", () => {
    const index = new MetadataIndex([
      {
        path: "test.thrift",
        name: "test",
        ast: {
          struct: {
            User: [
              { id: 1, name: "id", type: "uuid" },
              { id: 2, name: "tag", type: "string" },
            ],
          },
        },
      },
    ]);

    const codecs = new MetadataCodecs(index, "bigint");
    const userCodec = codecs.type("User", "test");

    const writer = new BinaryWriter();
    userCodec.write(writer, { id: sampleUuid, tag: "admin" });
    const encoded = writer.finish();

    const reader = new BinaryReader(encoded);
    const decoded = userCodec.read(reader);
    expect(decoded).toEqual({ id: sampleUuid, tag: "admin" });
  });
});
