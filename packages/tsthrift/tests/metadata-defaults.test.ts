import { expect, test } from "vite-plus/test";
import { MetadataIndex } from "../src/converter/metadata-index.ts";
import { MetadataCodecs } from "../src/metadata/codecs.ts";
import { BinaryReader, BinaryWriter } from "../src/runtime.ts";
import type { Metadata } from "../src/converter/types.ts";

const schema = (): Metadata[] => [
  {
    name: "common",
    path: "common.thrift",
    ast: {
      const: { COUNT: { type: "i64", value: 42 }, LABEL: { type: "string", value: "label" } },
      enum: { State: { items: [{ name: "START", value: 3 }, { name: "READY" }] } },
      struct: { Key: [{ id: 1, name: "id", type: "i64", option: "required" }] },
    },
  },
  {
    name: "example",
    path: "example.thrift",
    ast: {
      include: { common: { path: "common.thrift" } },
      struct: {
        Value: [
          { id: 1, name: "count", type: "i64", defaultValue: { "=": ["common", "COUNT"] } },
          {
            id: 2,
            name: "state",
            type: "common.State",
            defaultValue: { "=": ["common.State.READY"] },
          },
          { id: 3, name: "bytes", type: "binary", defaultValue: "abc" },
          { id: 4, name: "enabled", type: "bool", defaultValue: 0 },
          {
            id: 5,
            name: "mapping",
            type: {
              name: "map",
              keyType: "common.Key",
              valueType: { name: "set", valueType: "string" },
            },
            defaultValue: [
              {
                key: [{ key: "id", value: { "=": ["common", "COUNT"] } }],
                value: [{ "=": ["common", "LABEL"] }],
              },
            ],
          },
          { id: 6, name: "next", type: "Value", option: "optional" },
        ],
      },
    },
  },
];

test.each(["number", "bigint"] as const)(
  "evaluates recursive defaults in %s mode without sharing values",
  (mode) => {
    const codec = new MetadataCodecs(new MetadataIndex(schema()), mode).type("Value", "example");
    const first = codec.read(new BinaryReader(new Uint8Array([0])));
    const second = codec.read(new BinaryReader(new Uint8Array([0])));
    expect(first).toEqual({
      count: mode === "number" ? 42 : 42n,
      state: 4,
      bytes: new Uint8Array([97, 98, 99]),
      enabled: false,
      mapping: new Map([[{ id: mode === "number" ? 42 : 42n }, new Set(["label"])]]),
    });
    first.mapping.clear();
    first.bytes[0] = 0;
    expect(second.mapping.size).toBe(1);
    expect(second.bytes[0]).toBe(97);
    const writer = new BinaryWriter();
    codec.write(writer, { next: {} });
    expect(codec.read(new BinaryReader(writer.finish())).next).toEqual(second);
  },
);

test("rejects cyclic constants and unsafe numeric metadata defaults", () => {
  const metadata = schema();
  metadata[0]!.ast.const!.COUNT!.value = { "=": ["COUNT"] };
  expect(() =>
    new MetadataCodecs(new MetadataIndex(metadata), "bigint").type("Value", "example"),
  ).toThrow(/Circular metadata constant/);
  metadata[0]!.ast.const!.COUNT!.value = 9007199254740992;
  expect(() =>
    new MetadataCodecs(new MetadataIndex(metadata), "bigint").type("Value", "example"),
  ).toThrow(/Invalid i64 default/);
});
