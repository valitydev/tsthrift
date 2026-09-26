import http from "node:http";
import type { AddressInfo } from "node:net";
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import thrift from "thrift";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { generate } from "../src/index.ts";
import {
  type RequestOptions,
  type ThriftClientConstructor,
  ThriftHttpError,
  createThriftClient,
} from "@vality/tsthrift";

const { TBinaryProtocol, TBufferedTransport } = thrift;
const compiler = process.env.THRIFT_COMPILER;
const integration = test.skipIf(!compiler);

interface RpcTestServiceClient {
  ping(message: string, options?: RequestOptions): Promise<string>;
  multiply(a: bigint, b: bigint, options?: RequestOptions): Promise<bigint>;
  _reqs: Record<number, unknown>;
}

describe("Thrift RPC client integration", () => {
  let server: http.Server;
  let endpoint: string;
  let directory: string;
  let ClientClass: ThriftClientConstructor<RpcTestServiceClient>;
  let FailureClass: new (args: { reason: string }) => { reason: string };

  beforeAll(async () => {
    if (!compiler) return;

    directory = await mkdtemp(path.join(tmpdir(), "tsthrift-client-test-"));
    const inputDir = path.join(directory, "proto");
    const outputDir = path.join(directory, "generated");
    const dependencyDir = path.join(directory, "dep");

    await symlink(
      path.resolve(import.meta.dirname, "../node_modules"),
      path.join(directory, "node_modules"),
      "dir",
    );

    await cp(path.join(import.meta.dirname, "fixtures/dependency"), dependencyDir, {
      recursive: true,
    });
    await cp(path.join(import.meta.dirname, "fixtures/proto"), inputDir, { recursive: true });

    await writeFile(
      path.join(inputDir, "rpc_test.thrift"),
      `
      exception Failure { 1: string reason }
      service RpcTestService {
        string ping(1: string message) throws (1: Failure failure)
        i64 multiply(1: i64 a, 2: i64 b)
      }
    `,
    );

    await generate({
      input: inputDir,
      includes: [dependencyDir],
      output: outputDir,
      target: "apache",
      compiler,
      namespaces: ["rpc_test"],
    });

    const requireModule = createRequire(import.meta.url);
    const clientModule = requireModule(path.join(outputDir, "internal/RpcTestService.js"));
    const typesModule = requireModule(path.join(outputDir, "internal/rpc_test_types.js"));
    ClientClass = clientModule.Client;
    const ProcessorClass = clientModule.Processor;
    FailureClass = typesModule.Failure;

    const handler = {
      async ping(message: string) {
        if (message === "fail") {
          throw new FailureClass({ reason: "explicit failure requested" });
        }
        return `echo: ${message}`;
      },
      async multiply(a: bigint, b: bigint) {
        return a * b;
      },
    };

    const processor = new ProcessorClass(handler);

    server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
      if (url.pathname === "/500") {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Crash");
        return;
      }

      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        TBufferedTransport.receiver((inputTransport: unknown) => {
          const outputTransport = new TBufferedTransport(undefined, (responseBytes: Buffer) => {
            res.writeHead(200, { "Content-Type": "application/x-thrift" });
            res.end(responseBytes);
          });

          processor.process(
            new TBinaryProtocol(inputTransport),
            new TBinaryProtocol(outputTransport),
          );
        })(Buffer.concat(chunks));
      });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const addr = server.address() as AddressInfo;
    endpoint = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
    if (directory) {
      await rm(directory, { recursive: true, force: true });
    }
  });

  integration("executes RPC methods successfully returning Promises", async () => {
    const client = createThriftClient(ClientClass, { endpoint });
    const pingResult = await client.ping("hello world");
    expect(pingResult).toBe("echo: hello world");

    const multiplyResult = await client.multiply(123456789012345n, 2n);
    expect(multiplyResult).toBe(246913578024690n);
    expect(Object.keys(client._reqs)).toEqual([]);
  });

  integration("propagates declared IDL exceptions as typed rejections", async () => {
    const client = createThriftClient(ClientClass, { endpoint });
    await expect(client.ping("fail")).rejects.toThrow();

    try {
      await client.ping("fail");
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(FailureClass);
      expect((err as { reason: string }).reason).toBe("explicit failure requested");
    }
    expect(Object.keys(client._reqs)).toEqual([]);
  });

  integration("propagates HTTP 500 errors and cleans up pending requests", async () => {
    const client = createThriftClient(ClientClass, { endpoint: `${endpoint}/500` });
    await expect(client.ping("test")).rejects.toThrow(ThriftHttpError);
    expect(Object.keys(client._reqs)).toEqual([]);
  });

  integration("supports per-call RequestOptions cancellation and timeout", async () => {
    const client = createThriftClient(ClientClass, { endpoint });
    const controller = new AbortController();
    controller.abort(new Error("abort call"));

    await expect(client.ping("test", { signal: controller.signal })).rejects.toThrow("abort call");
    expect(Object.keys(client._reqs)).toEqual([]);
  });

  integration("transparently converts numbers to bigint and back with metadata", async () => {
    const metadata = JSON.parse(
      await readFile(path.join(directory, "generated/metadata.json"), "utf8"),
    );
    const client = createThriftClient(ClientClass, {
      endpoint,
      metadata,
      i64Mode: "number",
    });

    const result = await (client as any).multiply(1000, 25);
    expect(result).toBe(25000);
    expect(typeof result).toBe("number");
    expect(Object.keys(client._reqs)).toEqual([]);
  });
});
