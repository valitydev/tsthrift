import { expect, test, vi } from "vite-plus/test";
import {
  BinaryWriter,
  FlakeId,
  MessageType,
  type Metadata,
  THRIFT_ERRORS,
  ThriftHttpError,
  ThriftServiceError,
  bs64,
  createHttpTransport,
  createLazyMetadataClient,
  createMetadataClient,
  createMetadataLoader,
  createNamespaceLoader,
  generateId,
  isThriftServiceError,
  isThriftSystemError,
} from "../src/index.ts";
import { formatUuid, parseUuid } from "../src/runtime/uuid.ts";

const metadata: Metadata[] = [
  {
    name: "test",
    path: "test.thrift",
    ast: {
      exception: { Missing: [{ id: 1, name: "reason", type: "string" }] },
      service: {
        Test: {
          functions: {
            call: {
              name: "call",
              type: "void",
              args: [],
              throws: [{ id: 1, name: "missing", type: "Missing" }],
              oneway: false,
            },
          },
        },
      },
    },
  },
];

test("metadata loaders and lazy clients recover after a transient load rejection", async () => {
  const fetchMetadata = vi
    .fn()
    .mockRejectedValueOnce(new Error("temporary"))
    .mockResolvedValue(metadata);
  const namespace = createNamespaceLoader({ test: fetchMetadata });
  const load = createMetadataLoader({ test: async () => ({ loadThriftMetadata: namespace }) });
  const client = createLazyMetadataClient(
    {
      metadata: () => load("test"),
      namespace: "test",
      serviceName: "Test",
      endpoint: "unused",
      transport: async () => {
        const writer = new BinaryWriter();
        writer.writeMessageBegin("call", MessageType.Reply, 1);
        writer.writeFieldStop();
        return writer.finish();
      },
    },
    ["call"],
  );
  expect(JSON.stringify(client)).toBe("{}");
  expect(client.ngOnDestroy).toBeUndefined();
  await expect(client.call!()).rejects.toThrow("temporary");
  await expect(client.call!()).resolves.toBeUndefined();
  expect(fetchMetadata).toHaveBeenCalledTimes(2);
});

test("default Flake IDs stay unique and ordered across clock rollback and sequence exhaustion", () => {
  const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
  try {
    const flake = new FlakeId();
    const ids = Array.from({ length: 5000 }, () => bs64.encode(flake.next()));
    now.mockReturnValue(0);
    ids.push(bs64.encode(flake.next()));
    expect(new Set(ids).size).toBe(5001);
    const values = ids.map((id) => new DataView(bs64.decode(id).buffer).getBigUint64(0));
    expect(values).toEqual([...values].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)));
    expect(() => generateId()).not.toThrow();
  } finally {
    now.mockRestore();
  }
});

test("strict FlakeId keeps upstream failure semantics", () => {
  const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
  try {
    const flake = new FlakeId({ strict: true });
    for (let i = 0; i < 4096; i++) flake.next();
    expect(() => flake.next()).toThrow("Sequence exceeded");
    now.mockReturnValue(0);
    expect(() => flake.next()).toThrow("Clock moved backwards");
  } finally {
    now.mockRestore();
  }
});

test("arbitrary wire UUID bytes can be written back", () => {
  const inputs = [0, 17, 127, 255].map((byte) => new Uint8Array(16).fill(byte));
  for (let i = 0; i < 1000; i++) inputs.push(crypto.getRandomValues(new Uint8Array(16)));
  for (const input of inputs) {
    const output = new Uint8Array(16);
    parseUuid(formatUuid(input), output);
    expect(output).toEqual(input);
  }
});

test.each([false, true])(
  "logger failure cannot change a successful RPC (async: %s)",
  async (asyncFailure) => {
    const log = vi.fn((event) => {
      expect(event).not.toHaveProperty("args");
      expect(event).not.toHaveProperty("headers");
      if (asyncFailure) return Promise.reject(new Error("logger"));
      throw new Error("logger");
    });
    const client = await createMetadataClient({
      metadata,
      namespace: "test",
      serviceName: "Test",
      endpoint: "unused",
      loggingFn: log,
      transport: async () => {
        const writer = new BinaryWriter();
        writer.writeMessageBegin("call", MessageType.Reply, 1);
        writer.writeFieldStop();
        return writer.finish();
      },
    });
    await expect(client.call!()).resolves.toBeUndefined();
    expect(log.mock.calls.map(([event]) => event.type)).toEqual(["call", "success"]);
  },
);

test("RPC rejects with a qualified error wrapper and preserves context", async () => {
  const client = await createMetadataClient({
    metadata,
    namespace: "test",
    serviceName: "Test",
    endpoint: "unused",
    transport: async () => {
      const writer = new BinaryWriter();
      writer.writeMessageBegin("call", MessageType.Reply, 1);
      writer.writeFieldBegin(12, 1);
      writer.writeFieldBegin(11, 1);
      writer.writeString("missing");
      writer.writeFieldStop();
      writer.writeFieldStop();
      return writer.finish();
    },
  });
  await expect(client.call!()).rejects.toMatchObject({
    type: "test.Missing",
    data: { reason: "missing" },
    context: { sequenceId: 1, method: "call" },
  });
});

test("shared error symbols and brands work across separate runtime copies", async () => {
  const other = await import("../dist/index.mjs");
  expect(other.THRIFT_ERRORS).toBe(THRIFT_ERRORS);
  const service = new other.ThriftServiceError("test.Missing", "missing", {});
  expect(service).not.toBeInstanceOf(ThriftServiceError);
  expect(isThriftServiceError(service, "test.Missing")).toBe(true);
  expect(isThriftSystemError(new other.ThriftHttpError(500, "Failure"))).toBe(true);
});

test("HTTP error details are bounded and excluded from the message", async () => {
  const body = "sensitive".repeat(1000);
  const transport = createHttpTransport({
    endpoint: "https://example.test",
    fetch: async () => new Response(body, { status: 500 }),
  });
  try {
    await transport(new Uint8Array());
    throw new Error("Expected HTTP failure");
  } catch (error) {
    expect(error).toBeInstanceOf(ThriftHttpError);
    expect((error as ThriftHttpError).body).toHaveLength(1024);
    expect((error as Error).message).not.toContain("sensitive");
  }
});

test("HTTP correlation reaches the error and completion log without exposing headers", async () => {
  const events: unknown[] = [];
  const client = await createMetadataClient({
    metadata,
    namespace: "test",
    serviceName: "Test",
    endpoint: "https://example.test",
    headers: { "X-Woody-Trace-Id": "trace", Authorization: "secret" },
    loggingFn: (event) => {
      events.push(event);
    },
    fetch: async () => new Response("private body", { status: 503 }),
  });
  await expect(client.call!()).rejects.toMatchObject({
    context: { traceId: "trace", sequenceId: 1 },
  });
  expect(events.at(-1)).toMatchObject({ traceId: "trace", type: "error" });
  expect(JSON.stringify(events)).not.toContain("secret");
  expect(JSON.stringify(events)).not.toContain("private body");
});

test("metadata validation rejects unsupported versions and malformed parser shapes", async () => {
  const { MetadataIndex, validateThriftAst } = await import("../src/index.ts");
  expect(
    () => new MetadataIndex([{ ...metadata[0]!, metadataVersion: 2 } as unknown as Metadata]),
  ).toThrow("Unsupported metadata version");
  expect(() =>
    validateThriftAst({ struct: { Broken: [{ name: "x", type: { name: "map" } }] } }),
  ).toThrow("Invalid type");
  const index = new MetadataIndex([
    { ...metadata[0]!, build: { i64: "number", lowerCaseMethods: false } },
  ]);
  await expect(
    createMetadataClient({ index, namespace: "test", serviceName: "Test", endpoint: "unused" }),
  ).rejects.toThrow("Incompatible generated settings");
});
