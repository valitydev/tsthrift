import { expect, test, vi } from "vite-plus/test";
import { createMetadataClient } from "../src/metadata/client.ts";
import { MetadataIndex } from "../src/converter/metadata-index.ts";
import { MetadataCodecs } from "../src/metadata/codecs.ts";
import { BinaryReader, BinaryWriter, MessageType } from "../src/runtime.ts";
import type { Metadata } from "../src/converter/types.ts";

const schema = (): Metadata[] => [
  {
    name: "example",
    path: "example.thrift",
    ast: {
      service: {
        Example: {
          functions: {
            next: {
              name: "next",
              type: "i64",
              args: [{ id: 1, name: "options", type: "i64" }],
              throws: [],
              oneway: false,
            },
          },
        },
      },
    },
  },
];

test("loads metadata once, snapshots it, and keeps call options separate from payload", async () => {
  const metadata = schema();
  const loader = vi.fn(async () => ({ default: metadata }));
  const options = { headers: { test: "header" } };
  const client = await createMetadataClient({
    endpoint: "unused",
    namespace: "example",
    serviceName: "Example",
    metadata: loader,
    transport: async (bytes, requestOptions) => {
      expect(requestOptions).toBe(options);
      const reader = new BinaryReader(bytes);
      const header = reader.readMessageBegin();
      expect(reader.readFieldBegin()).toEqual({ type: 10, id: 1 });
      const value = reader.readI64();
      const writer = new BinaryWriter();
      writer.writeMessageBegin("next", MessageType.Reply, header.sequenceId);
      writer.writeFieldBegin(10, 0);
      writer.writeI64(value);
      writer.writeFieldStop();
      return writer.finish();
    },
  });
  metadata[0]!.ast.service!.Example!.functions.next!.args[0]!.type = "string";
  expect(await Promise.all([client.next(0n, options), client.next(42n, options)])).toEqual([
    0n,
    42n,
  ]);
  expect(loader).toHaveBeenCalledTimes(1);
});

test.each([
  [
    "unknown service",
    (data: Metadata[]) => {
      delete data[0]!.ast.service!.Example;
    },
    /Unknown metadata service/,
  ],
  [
    "missing type",
    (data: Metadata[]) => {
      data[0]!.ast.service!.Example!.functions.next!.type = "Missing";
    },
    /Unknown metadata type/,
  ],
  [
    "duplicate modules",
    (data: Metadata[]) => {
      data.push(data[0]!);
    },
    /Duplicate metadata/,
  ],
  [
    "inheritance cycle",
    (data: Metadata[]) => {
      data[0]!.ast.service!.Example!.extends = "Example";
    },
    /Circular service/,
  ],
  [
    "duplicate fields",
    (data: Metadata[]) => {
      data[0]!.ast.service!.Example!.functions.next!.args.push({
        id: 1,
        name: "other",
        type: "string",
      });
    },
    /duplicate metadata field/,
  ],
] as const)("rejects %s before opening a transport", async (_name, change, error) => {
  const metadata = schema();
  change(metadata);
  const transport = vi.fn();
  await expect(
    createMetadataClient({
      endpoint: "unused",
      namespace: "example",
      serviceName: "Example",
      metadata,
      transport,
    }),
  ).rejects.toThrow(error);
  expect(transport).not.toHaveBeenCalled();
});

test("resolves container typedefs in their defining module and relative includes", () => {
  const metadata: Metadata[] = [
    {
      name: "source",
      path: "nested/source.thrift",
      ast: {
        include: { alias: { path: "../types.thrift" } },
        typedef: { Items: { type: "alias.Items" } },
      },
    },
    {
      name: "types",
      path: "types.thrift",
      ast: {
        typedef: { Items: { type: { name: "list", valueType: "Item" } } },
        struct: { Item: [{ id: 1, name: "id", type: "i64" }] },
      },
    },
  ];
  const codec = new MetadataCodecs(new MetadataIndex(metadata), "bigint").type("Items", "source");
  const writer = new BinaryWriter();
  codec.write(writer, [{ id: 9007199254740993n }]);
  expect(codec.read(new BinaryReader(writer.finish()))).toEqual([{ id: 9007199254740993n }]);
});
