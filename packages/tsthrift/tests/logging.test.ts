import { describe, expect, test, vi } from "vite-plus/test";
import {
  BinaryWriter,
  MessageType,
  type Metadata,
  type ThriftLogParams,
  WireType,
  combineLoggers,
  createLazyMetadataClient,
  createMetadataClient,
} from "../src/index.ts";
import { type ConsoleLoggerSink, createConsoleLogger } from "../src/devtools.ts";

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
              args: [{ id: 1, name: "id", type: "string" }],
              throws: [{ id: 1, name: "missing", type: "Missing" }],
              oneway: false,
            },
          },
        },
      },
    },
  },
];

function missingReply(): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeMessageBegin("call", MessageType.Reply, 1);
  writer.writeFieldBegin(WireType.Struct, 1);
  writer.writeFieldBegin(WireType.String, 1);
  writer.writeString("secret reason");
  writer.writeFieldStop();
  writer.writeFieldStop();
  return writer.finish();
}

async function failingCall(config: {
  logPayloads?: boolean;
  fetch?: typeof fetch;
}): Promise<ThriftLogParams> {
  const events: ThriftLogParams[] = [];
  const client = await createMetadataClient({
    metadata,
    namespace: "test",
    serviceName: "Test",
    endpoint: "https://example.test",
    loggingFn: (event) => void events.push(event),
    ...(config.fetch ? { fetch: config.fetch } : { transport: async () => missingReply() }),
    ...(config.logPayloads ? { logPayloads: true } : {}),
  });
  await expect(client.call!("id")).rejects.toThrow();
  return events.at(-1)!;
}

describe("error log events", () => {
  test("keep HTTP status without the response body", async () => {
    const event = await failingCall({
      fetch: async () => new Response("private body", { status: 401 }),
    });
    expect(event.error).toMatchObject({ name: "ThriftHttpError", status: 401 });
    expect(JSON.stringify(event)).not.toContain("private body");
  });

  test("include declared exception data only with logPayloads", async () => {
    const hidden = await failingCall({});
    expect(hidden.error?.name).toBe("test.Missing");
    expect(hidden.error).not.toHaveProperty("data");
    expect(JSON.stringify(hidden)).not.toContain("secret reason");

    const shown = await failingCall({ logPayloads: true });
    expect(shown.error?.data).toEqual({ reason: "secret reason" });
  });
});

describe("call-site stacks", () => {
  const failing = { transport: async () => missingReply() };

  test("runtime errors point to the caller through direct and lazy clients", async () => {
    const events: ThriftLogParams[] = [];
    const config = {
      metadata,
      namespace: "test",
      serviceName: "Test",
      endpoint: "unused",
      loggingFn: (event: ThriftLogParams) => void events.push(event),
      ...failing,
    };
    const direct = await createMetadataClient(config);
    const lazy = createLazyMetadataClient(config, ["call"]);

    async function directCaller() {
      return direct.call!("id");
    }
    async function lazyCaller() {
      return lazy.call!("id");
    }

    for (const caller of [directCaller, lazyCaller]) {
      const error = (await caller().catch((e: unknown) => e)) as Error;
      expect(error.stack?.split("\n")[0]).toBe(`${error.name}: ${error.message}`);
      expect(error.stack).toContain(caller.name);
      expect(events.at(-1)?.error?.stack).toBe(error.stack);
    }
  });
});

describe("combineLoggers", () => {
  test("skips falsy entries and isolates failing loggers", () => {
    const received = vi.fn();
    const logger = combineLoggers(
      false,
      () => {
        throw new Error("broken");
      },
      undefined,
      received,
    );
    const event: ThriftLogParams = { type: "call", name: "call", serviceName: "Test" };
    expect(() => logger(event)).not.toThrow();
    expect(received).toHaveBeenCalledWith(event);
  });
});

describe("createConsoleLogger", () => {
  function sink() {
    const method = () => vi.fn<(...data: unknown[]) => void>();
    return {
      groupCollapsed: method(),
      groupEnd: method(),
      log: method(),
      error: method(),
    } satisfies ConsoleLoggerSink;
  }

  test("keeps a text label and bare values inside the group", () => {
    const out = sink();
    createConsoleLogger({ console: out })({
      type: "success",
      name: "call",
      serviceName: "Test",
      namespace: "test",
      durationMs: 12.4,
      traceId: "trace",
      args: ["id", 2],
      response: { ok: true },
    });
    expect(out.groupCollapsed).toHaveBeenCalledExactlyOnceWith("🟢 Test.call 12ms · trace trace");
    expect(out.log.mock.calls).toEqual([["namespace test"], ["id", 2], [{ ok: true }]]);
    expect(out.groupEnd).toHaveBeenCalledOnce();
  });

  test("prints failures as an Error with the event stack and extra details", () => {
    const out = sink();
    const stack = "ThriftHttpError: HTTP request failed\n    at caller (app.ts:1:1)";
    const error = { name: "ThriftHttpError", message: "HTTP request failed", status: 404, stack };
    createConsoleLogger({ console: out })({
      type: "error",
      name: "call",
      serviceName: "Test",
      durationMs: 3,
      traceId: "abc",
      error,
    });
    expect(out.groupCollapsed).toHaveBeenCalledExactlyOnceWith(
      "🔴 Test.call 3ms · trace abc — HTTP request failed",
    );
    const [logged] = out.error.mock.calls[0] as [Error];
    expect(logged).toBeInstanceOf(Error);
    expect(logged.stack).toBe(stack);
    expect(out.log.mock.calls.at(-1)).toEqual([{ status: 404 }]);
  });

  test("omits the details object when the error has only a name and message", () => {
    const out = sink();
    createConsoleLogger({ console: out })({
      type: "error",
      name: "call",
      serviceName: "Test",
      error: { name: "ThriftTimeoutError", message: "Request timed out" },
    });
    expect(out.log).not.toHaveBeenCalled();
    expect(out.error.mock.calls[0]![0]).toBeInstanceOf(Error);
  });

  test("honors success and calls options", () => {
    const out = sink();
    const logger = createConsoleLogger({ console: out, success: false, calls: true });
    logger({ type: "call", name: "call", serviceName: "Test" });
    logger({ type: "success", name: "call", serviceName: "Test", durationMs: 1 });
    expect(out.log).toHaveBeenCalledWith("⚪ Test.call");
    expect(out.groupCollapsed).not.toHaveBeenCalled();
  });
});
