import { describe, expect, test } from "vite-plus/test";
import { type Metadata, type ThriftClientConstructor, createThriftClient } from "../src/index.ts";

const metadata: Metadata[] = [
  {
    path: "test.thrift",
    name: "test",
    ast: {
      service: {
        TestService: {
          functions: {
            echo: {
              type: "Request",
              name: "echo",
              args: [{ name: "request", type: "Request" }],
              throws: [],
              oneway: false,
            },
            next: {
              type: "i64",
              name: "next",
              args: [{ name: "id", type: "i64" }],
              throws: [],
              oneway: false,
            },
          },
        },
      },
      struct: {
        Request: [
          { name: "id", type: "i64", id: 1 },
          { name: "tags", type: { name: "set", valueType: "string" }, id: 2 },
        ],
      },
    },
  },
];

interface MockRequest {
  id: number | bigint;
  tags?: Set<string> | string[];
}

interface MockClient {
  echo(req: MockRequest, options?: unknown): Promise<MockRequest>;
  next(id: number | bigint, options?: unknown): Promise<number | bigint>;
  _reqs: Record<number, unknown>;
  _lastArgs?: unknown[];
}

class TestServiceClient {
  _seqid = 0;
  _reqs: Record<number, unknown> = {};
  _lastArgs?: unknown[];
  output: unknown;
  pClass: unknown;

  constructor(output: unknown, pClass: unknown) {
    this.output = output;
    this.pClass = pClass;
  }

  seqid() {
    return this._seqid;
  }

  new_seqid() {
    return ++this._seqid;
  }

  async echo(request: unknown) {
    this._lastArgs = [request];
    return request;
  }

  async next(id: bigint) {
    this._lastArgs = [id];
    return id + 1n;
  }
}

describe("Client transparent conversion", () => {
  const dummyTransport = async () => new Uint8Array();

  test("converts i64 number to bigint for call and back to number in number mode", async () => {
    const client = createThriftClient(
      TestServiceClient as unknown as ThriftClientConstructor<MockClient>,
      {
        endpoint: "http://dummy",
        metadata,
        i64Mode: "number",
      },
      dummyTransport,
    );

    const result = await client.next(42);
    expect(result).toBe(43);
    expect(typeof result).toBe("number");
    expect((client as unknown as MockClient)._lastArgs?.[0]).toBe(42n);
  });

  test("keeps i64 as bigint in bigint mode", async () => {
    const client = createThriftClient(
      TestServiceClient as unknown as ThriftClientConstructor<MockClient>,
      {
        endpoint: "http://dummy",
        metadata,
        i64Mode: "bigint",
      },
      dummyTransport,
    );

    const result = await client.next(100n);
    expect(result).toBe(101n);
    expect((client as unknown as MockClient)._lastArgs?.[0]).toBe(100n);
  });

  test("converts set to array for Thrift protocol and restores Set on return", async () => {
    const client = createThriftClient(
      TestServiceClient as unknown as ThriftClientConstructor<MockClient>,
      {
        endpoint: "http://dummy",
        metadata,
        i64Mode: "number",
      },
      dummyTransport,
    );

    const input = { id: 10, tags: new Set(["tag1", "tag2"]) };
    const output = await client.echo(input);

    expect(output.id).toBe(10);
    expect(output.tags).toBeInstanceOf(Set);
    expect(Array.from(output.tags as Set<string>)).toEqual(["tag1", "tag2"]);

    // Sent to underlying client with tags as array and id as bigint
    const underlyingArg = (client as unknown as MockClient)._lastArgs?.[0] as Record<
      string,
      unknown
    >;
    expect(underlyingArg.id).toBe(10n);
    expect(Array.isArray(underlyingArg.tags)).toBe(true);
  });

  test("handles call options alongside converted arguments", async () => {
    const client = createThriftClient(
      TestServiceClient as unknown as ThriftClientConstructor<MockClient>,
      {
        endpoint: "http://dummy",
        metadata,
        i64Mode: "number",
      },
      dummyTransport,
    );

    const res = await client.next(5, { headers: { "x-test": "1" } });
    expect(res).toBe(6);
    expect((client as unknown as MockClient)._lastArgs?.[0]).toBe(5n);
  });

  test("falls back gracefully when metadata is not provided", async () => {
    const client = createThriftClient(
      TestServiceClient as unknown as ThriftClientConstructor<MockClient>,
      {
        endpoint: "http://dummy",
      },
      dummyTransport,
    );

    const res = await client.next(10n);
    expect(res).toBe(11n);
  });

  test("supports async metadata Promise", async () => {
    const asyncMetadata = new Promise<Metadata[]>((resolve) => {
      setTimeout(() => resolve(metadata), 10);
    });

    const client = createThriftClient(
      TestServiceClient as unknown as ThriftClientConstructor<MockClient>,
      {
        endpoint: "http://dummy",
        metadata: asyncMetadata,
        i64Mode: "number",
      },
      dummyTransport,
    );

    const res = await client.next(100);
    expect(res).toBe(101);
    expect(typeof res).toBe("number");
  });

  test("supports lazy dynamic import factory with default export", async () => {
    let loaderCallCount = 0;
    const lazyLoader = async () => {
      loaderCallCount++;
      return { default: metadata };
    };

    const client = createThriftClient(
      TestServiceClient as unknown as ThriftClientConstructor<any>,
      {
        endpoint: "http://example.com/thrift",
        metadata: lazyLoader,
      },
      dummyTransport,
    );

    // Loader should not have been called yet until first method invocation
    expect(loaderCallCount).toBe(0);

    const [res1, res2] = await Promise.all([
      client.echo({ id: 1n, tags: new Set(["tag1"]) }),
      client.echo({ id: 2n, tags: new Set(["tag2"]) }),
    ]);

    expect(loaderCallCount).toBe(1);
    expect(res1).toEqual({ id: 1n, tags: new Set(["tag1"]) });
    expect(res2).toEqual({ id: 2n, tags: new Set(["tag2"]) });
  });

  test("supports sync metadata loader function", async () => {
    const client = createThriftClient(
      TestServiceClient as unknown as ThriftClientConstructor<any>,
      {
        endpoint: "http://example.com/thrift",
        metadata: () => metadata,
      },
      dummyTransport,
    );

    const res = await client.echo({ id: 3n, tags: new Set(["fast"]) });
    expect(res).toEqual({ id: 3n, tags: new Set(["fast"]) });
  });

  test("invokes loggingFn on call, success, and error lifecycle events", async () => {
    const logs: any[] = [];
    const client = createThriftClient(
      TestServiceClient as unknown as ThriftClientConstructor<any>,
      {
        endpoint: "http://example.com/thrift",
        metadata,
        loggingFn: (params) => logs.push(params),
      },
      dummyTransport,
    );

    const res = await client.echo(
      { id: 10n, tags: new Set(["logged"]) },
      { headers: { "x-trace-id": "trace-999" } },
    );
    expect(res).toEqual({ id: 10n, tags: new Set(["logged"]) });

    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({
      type: "call",
      name: "echo",
      serviceName: "TestService",
      headers: { "x-trace-id": "trace-999" },
    });
    expect(logs[1]).toMatchObject({
      type: "success",
      name: "echo",
      serviceName: "TestService",
      headers: { "x-trace-id": "trace-999" },
      response: { id: 10n, tags: new Set(["logged"]) },
    });

    // Test error lifecycle
    logs.length = 0;
    class FailingServiceClient extends TestServiceClient {
      override async echo(): Promise<any> {
        throw new Error("network failure");
      }
    }
    const failingClient = createThriftClient(
      FailingServiceClient as unknown as ThriftClientConstructor<any>,
      {
        endpoint: "http://example.com/thrift",
        metadata,
        loggingFn: (params) => logs.push(params),
      },
      dummyTransport,
    );

    await expect(failingClient.echo({ id: 1n })).rejects.toThrow("network failure");
    expect(logs).toHaveLength(2);
    expect(logs[0].type).toBe("call");
    expect(logs[1]).toMatchObject({
      type: "error",
      name: "echo",
      serviceName: "FailingService",
      error: expect.any(Error),
    });
  });
});
