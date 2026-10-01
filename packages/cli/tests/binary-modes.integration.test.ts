import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test } from "vite-plus/test";
import { generate } from "../src/index.ts";

const execute = promisify(execFile);
const tsc = path.resolve(
  path.dirname(createRequire(import.meta.url).resolve("typescript")),
  "../bin/tsc",
);

test.each(["base64", "uint8array"] as const)(
  "executes generated binary models, defaults, and services in %s mode",
  async (binary) => {
    const directory = await mkdtemp(path.join(tmpdir(), "tsthrift-binary-mode-"));
    try {
      await symlink(
        path.resolve(import.meta.dirname, "../node_modules"),
        path.join(directory, "node_modules"),
        "dir",
      );
      await writeFile(path.join(directory, "package.json"), '{"type":"module"}');
      const input = path.join(directory, "example.thrift");
      const output = path.join(directory, "generated");
      await writeFile(
        input,
        `
        typedef binary Bytes
        const Bytes BYTES = "Привет"
        struct Payload {
          1: optional Bytes bytes = BYTES
          2: optional list<Bytes> items = [BYTES]
          3: optional map<Bytes, Bytes> mapping = {BYTES: BYTES}
        }
        const Payload DEFAULT = {}
        service Echo {
          binary echo(1: binary value)
          Payload defaults()
        }
      `,
      );
      // Omission exercises the public default; the byte mode exercises the built CLI flag.
      if (binary === "base64") {
        expect((await generate({ input, output })).binary).toBe("base64");
      } else {
        await execute(process.execPath, [
          path.resolve(import.meta.dirname, "../dist/cli.mjs"),
          "--input",
          input,
          "--output",
          output,
          "--binary",
          binary,
        ]);
      }
      await writeFile(
        path.join(directory, "consumer.mts"),
        `
        import { BYTES, createEcho, type Bytes, type Payload } from "./generated/index.js";
        const bytes: ${binary === "base64" ? "string" : "Uint8Array"} = BYTES;
        const alias: Bytes = bytes;
        const payload: Payload = { bytes: alias, items: [alias], mapping: new Map([[alias, alias]]) };
        const result: Promise<Bytes> = createEcho({ endpoint: "unused" }).echo(alias);
        // @ts-expect-error Binary mode is fixed by the generated factory.
        createEcho({ endpoint: "unused", binaryMode: "${binary}" });
        void payload; void result;
      `,
      );
      const compiled = path.join(directory, "compiled");
      await execute(process.execPath, [
        tsc,
        "--ignoreConfig",
        "--strict",
        "--isolatedDeclarations",
        "--declaration",
        "--target",
        "es2022",
        "--module",
        "nodenext",
        "--outDir",
        compiled,
        path.join(directory, "consumer.mts"),
      ]);
      await writeFile(
        path.join(directory, "verify.mjs"),
        `
        import assert from "node:assert/strict";
        import { createRequire } from "node:module";
        import { binaryToString, createMetadataClient } from "@vality/tsthrift";
        import { BYTES, DEFAULT, createEcho, Echo, TSTHRIFT_BUILD } from "./compiled/generated/index.js";
        const { TBinaryProtocol, TBufferedTransport } = createRequire(import.meta.url)("thrift");
        const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
        const represent = value => ${binary === "base64" ? 'binaryToString(value, "base64")' : "value"};
        const constant = represent(new TextEncoder().encode("Привет"));
        assert.deepEqual(BYTES, constant);
        assert.deepEqual(DEFAULT.bytes, constant);
        assert.deepEqual(DEFAULT.items, [constant]);
        assert.deepEqual([...DEFAULT.mapping], [[constant, constant]]);
        assert.equal(TSTHRIFT_BUILD.binary, "${binary}");
        const metadata = await Echo.getMetadata();
        assert.equal(metadata[0].build.binary, "${binary}");
        const config = { endpoint: "unused", transport: async request => {
          let response;
          TBufferedTransport.receiver(transport => {
            const reader = new TBinaryProtocol(transport);
            const header = reader.readMessageBegin();
            if (header.fname === "echo") {
              assert.equal(reader.readFieldBegin().ftype, 11);
              assert.deepEqual([...reader.readBinary()], [...bytes]);
              reader.readFieldEnd();
            }
            assert.equal(reader.readFieldBegin().ftype, 0);
            const writerTransport = new TBufferedTransport(undefined, value => { response = new Uint8Array(value); });
            const writer = new TBinaryProtocol(writerTransport);
            writer.writeMessageBegin(header.fname, 2, header.rseqid);
            writer.writeFieldBegin("success", header.fname === "echo" ? 11 : 12, 0);
            if (header.fname === "echo") writer.writeBinary(Buffer.from(bytes));
            else { writer.writeStructBegin("Payload"); writer.writeFieldStop(); writer.writeStructEnd(); }
            writer.writeFieldEnd(); writer.writeFieldStop(); writer.writeMessageEnd();
            writerTransport.flush();
          })(Buffer.from(request));
          return response;
        }};
        for (const client of [createEcho(config), Echo.createService(config), await createMetadataClient({ ...config, metadata, namespace: "example", serviceName: "Echo", binaryMode: "${binary}" })]) {
          assert.deepEqual(await client.echo(represent(bytes)), represent(bytes));
          assert.deepEqual(await client.defaults(), DEFAULT);
        }
        if ("${binary}" === "base64") await assert.rejects(createEcho(config).echo("!"));
        await assert.rejects(createMetadataClient({ ...config, metadata, namespace: "example", serviceName: "Echo", binaryMode: "${binary === "base64" ? "uint8array" : "base64"}" }), /Incompatible generated settings/);
        console.log("binary checks passed");
      `,
      );
      expect(
        (await execute(process.execPath, [path.join(directory, "verify.mjs")])).stdout.trim(),
      ).toBe("binary checks passed");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  30_000,
);

test.each(["buffer", "string"])(
  "rejects unknown binary mode %s before publishing output",
  async (binary) => {
    const directory = await mkdtemp(path.join(tmpdir(), "tsthrift-binary-invalid-"));
    try {
      await mkdir(path.join(directory, "proto"));
      await expect(
        execute(process.execPath, [
          path.resolve(import.meta.dirname, "../dist/cli.mjs"),
          "--input",
          path.join(directory, "proto"),
          "--binary",
          binary,
        ]),
      ).rejects.toThrow("Invalid binary mode");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
