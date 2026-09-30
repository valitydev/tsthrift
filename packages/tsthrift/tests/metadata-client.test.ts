import { expect, test, vi } from "vite-plus/test";
import { createLazyMetadataClient, createMetadataClient } from "../src/index.ts";
import { toThriftResult } from "../src/index.ts";
import { MetadataIndex } from "../src/metadata/index.ts";
import { MetadataCodecs } from "../src/metadata/codecs.ts";
import { BinaryReader, BinaryWriter, MessageType } from "../src/runtime.ts";
import type { Metadata } from "../src/metadata/types.ts";

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

test("createLazyMetadataClient returns client synchronously and resolves on first call", async () => {
  const metadata = schema();
  const loader = vi.fn(async () => ({ default: metadata }));
  const client = createLazyMetadataClient<{ next: (n: bigint) => Promise<bigint> }>(
    {
      endpoint: "unused",
      namespace: "example",
      serviceName: "Example",
      metadata: loader,
      transport: async (bytes) => {
        const reader = new BinaryReader(bytes);
        const header = reader.readMessageBegin();
        reader.readFieldBegin();
        const val = reader.readI64();
        const writer = new BinaryWriter();
        writer.writeMessageBegin("next", MessageType.Reply, header.sequenceId);
        writer.writeFieldBegin(10, 0);
        writer.writeI64(val * 2n);
        writer.writeFieldStop();
        return writer.finish();
      },
    },
    ["next"],
  );

  // Not a Thenable:
  expect((client as any).then).toBeUndefined();
  expect(loader).not.toHaveBeenCalled();

  const res1 = await client.next(21n);
  expect(res1).toBe(42n);
  expect(loader).toHaveBeenCalledTimes(1);

  const resWrapped = await toThriftResult(client).next(10n);
  expect(resWrapped).toEqual({ data: 20n, error: undefined });

  const res2 = await client.next(50n);
  expect(res2).toBe(100n);
  expect(loader).toHaveBeenCalledTimes(1);
});

test("supports pre-initialized MetadataIndex without metadata or structuredClone", async () => {
  const index = new MetadataIndex(schema());
  const client = await createMetadataClient<{ next: (n: bigint) => Promise<bigint> }>({
    endpoint: "unused",
    namespace: "example",
    serviceName: "Example",
    index,
    transport: async (bytes) => {
      const reader = new BinaryReader(bytes);
      const header = reader.readMessageBegin();
      reader.readFieldBegin();
      const val = reader.readI64();
      const writer = new BinaryWriter();
      writer.writeMessageBegin("next", MessageType.Reply, header.sequenceId);
      writer.writeFieldBegin(10, 0);
      writer.writeI64(val + 1n);
      writer.writeFieldStop();
      return writer.finish();
    },
  });

  const res = await client.next(99n);
  expect(res).toBe(100n);
});

test("supports lowerCaseMethods mapping client methods to lowerFirst while preserving wireName", async () => {
  const metadata: Metadata[] = [
    {
      name: "payment",
      path: "payment.thrift",
      ast: {
        service: {
          PaymentService: {
            functions: {
              GetPayment: {
                name: "GetPayment",
                type: "string",
                args: [{ id: 1, name: "id", type: "string" }],
                throws: [],
                oneway: false,
              },
            },
          },
        },
      },
    },
  ];

  let wireMethodNameReceived = "";
  const client = await createMetadataClient<{
    getPayment: (id: string) => Promise<string>;
    GetPayment?: (id: string) => Promise<string>;
  }>({
    endpoint: "unused",
    namespace: "payment",
    serviceName: "PaymentService",
    metadata,
    lowerCaseMethods: true,
    transport: async (bytes) => {
      const reader = new BinaryReader(bytes);
      const header = reader.readMessageBegin();
      wireMethodNameReceived = header.name;
      reader.readFieldBegin();
      const id = reader.readString();
      const writer = new BinaryWriter();
      writer.writeMessageBegin("GetPayment", MessageType.Reply, header.sequenceId);
      writer.writeFieldBegin(11, 0);
      writer.writeString(`payment-${id}`);
      writer.writeFieldStop();
      return writer.finish();
    },
  });

  expect(typeof client.getPayment).toBe("function");
  expect(client.GetPayment).toBeUndefined();

  const result = await client.getPayment("123");
  expect(result).toBe("payment-123");
  expect(wireMethodNameReceived).toBe("GetPayment");

  const safeResult = await toThriftResult(client.getPayment("456"));
  expect(safeResult).toEqual({ data: "payment-456", error: undefined });
  expect((client as any).safe).toBeUndefined();

  const clientResult = await toThriftResult(client).getPayment("789");
  expect(clientResult).toEqual({ data: "payment-789", error: undefined });
});

test("scenario 1: methods differing only by initial case coexist normally, but collide under lowerCaseMethods", async () => {
  const metadata: Metadata[] = [
    {
      name: "example",
      path: "example.thrift",
      ast: {
        service: {
          Example: {
            functions: {
              GetItem: {
                name: "GetItem",
                type: "string",
                args: [],
                throws: [],
                oneway: false,
              },
              getItem: {
                name: "getItem",
                type: "string",
                args: [],
                throws: [],
                oneway: false,
              },
            },
          },
        },
      },
    },
  ];

  // 1. Without lowerCaseMethods: both methods coexist independently
  const normalClient = await createMetadataClient<any>({
    endpoint: "unused",
    namespace: "example",
    serviceName: "Example",
    metadata,
    transport: async (bytes) => {
      const reader = new BinaryReader(bytes);
      const header = reader.readMessageBegin();
      const writer = new BinaryWriter();
      writer.writeMessageBegin(header.name, MessageType.Reply, header.sequenceId);
      writer.writeFieldBegin(11, 0);
      writer.writeString(`reply-for-${header.name}`);
      writer.writeFieldStop();
      return writer.finish();
    },
  });

  expect(typeof normalClient.GetItem).toBe("function");
  expect(typeof normalClient.getItem).toBe("function");
  expect(await normalClient.GetItem()).toBe("reply-for-GetItem");
  expect(await normalClient.getItem()).toBe("reply-for-getItem");

  // 2. With lowerCaseMethods: true, collision is caught and cleanly rejected
  await expect(
    createMetadataClient({
      endpoint: "unused",
      namespace: "example",
      serviceName: "Example",
      metadata,
      lowerCaseMethods: true,
    }),
  ).rejects.toThrow("Method name collision in example.Example: getItem");
});

test("passes the requested namespace to root metadata loaders", async () => {
  const loader = vi.fn(async (namespace: string) => {
    expect(namespace).toBe("example");
    return schema();
  });
  await createMetadataClient({
    metadata: loader,
    namespace: "example",
    serviceName: "Example",
    endpoint: "unused",
  });
  expect(loader).toHaveBeenCalledExactlyOnceWith("example");
});
