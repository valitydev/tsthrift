import { expect, test } from "vite-plus/test";
import {
  BinaryReader,
  BinaryWriter,
  type Metadata,
  MetadataIndex,
  createMetadataClient,
} from "../src/index.ts";
import { MetadataCodecs } from "../src/metadata/codecs.ts";

const metadata: Metadata[] = [
  {
    name: "example",
    path: "example.thrift",
    ast: {
      service: {
        Echo: {
          functions: {
            echo: {
              name: "echo",
              type: "binary",
              args: [{ id: 1, name: "value", type: "binary" }],
              throws: [],
              oneway: false,
            },
          },
        },
      },
    },
  },
];

test("Base64 binary preserves empty bytes and rejects text and byte-array inputs", () => {
  const codec = new MetadataCodecs(new MetadataIndex(metadata), "bigint").type("binary", "example");
  const writer = new BinaryWriter();
  codec.write(writer, "");
  expect([...writer.finish()]).toEqual([0, 0, 0, 0]);
  expect(codec.read(new BinaryReader(writer.finish()))).toBe("");
  expect(() => codec.write(new BinaryWriter(), "!")).toThrow();
  expect(() => codec.write(new BinaryWriter(), new Uint8Array())).toThrow("Expected Base64 string");
});

test("older generated settings require explicit uint8array mode", async () => {
  const legacy: Metadata[] = [
    { ...metadata[0]!, build: { i64: "bigint", lowerCaseMethods: false } },
  ];
  const config = {
    metadata: legacy,
    namespace: "example",
    serviceName: "Echo",
    endpoint: "unused",
  };
  await expect(createMetadataClient(config)).rejects.toThrow("Incompatible generated settings");
  await expect(
    createMetadataClient({ ...config, binaryMode: "uint8array" }),
  ).resolves.toBeDefined();
  await expect(createMetadataClient({ ...config, binaryMode: "buffer" as never })).rejects.toThrow(
    "Unknown binary mode",
  );
});

test("unversioned metadata accepts either explicitly selected representation", async () => {
  const config = { metadata, namespace: "example", serviceName: "Echo", endpoint: "unused" };
  await expect(createMetadataClient(config)).resolves.toBeDefined();
  await expect(
    createMetadataClient({ ...config, binaryMode: "uint8array" }),
  ).resolves.toBeDefined();
});
