import { describe, expect, test } from "vite-plus/test";
import {
  type Metadata,
  type ThriftClientConstructor,
  createThriftClient,
  loadMetadata,
} from "../src/index.ts";

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

  test("loadMetadata loads metadata from fetch endpoint", async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () =>
        new Response(JSON.stringify(metadata), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });

      const loaded = await loadMetadata("http://example.com/metadata.json");
      expect(loaded).toEqual(metadata);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("loadMetadata rejects on non-200 HTTP response", async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () =>
        new Response("Not Found", {
          status: 404,
          statusText: "Not Found",
        });

      await expect(loadMetadata("http://example.com/404.json")).rejects.toThrow("404 Not Found");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
