import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, test } from "vite-plus/test";
import { generate } from "../src/index.ts";

const execute = promisify(execFile);
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

test.each(["base-proto", "base-proto/base"])(
  "executes generated external package imports through %s without inlining",
  async (importPath) => {
    const dir = await mkdtemp(path.join(tmpdir(), "tsthrift-external-package-"));
    directories.push(dir);
    await writeFile(path.join(dir, "package.json"), '{"type":"module"}');
    await mkdir(path.join(dir, "node_modules/@vality"), { recursive: true });
    await symlink(
      path.resolve(import.meta.dirname, "../../tsthrift"),
      path.join(dir, "node_modules/@vality/tsthrift"),
      "dir",
    );
    const base = path.join(dir, "base.thrift");
    const child = path.join(dir, "child.thrift");
    await writeFile(
      base,
      'const string MARKER = "EXTERNAL_PACKAGE_ONLY"\nservice Base { i64 get(1: i64 value) }',
    );
    await writeFile(
      child,
      'include "base.thrift"\nservice Child extends base.Base { i64 echo(1: i64 value) }',
    );
    const pkg = path.join(dir, "node_modules/base-proto");
    await generate({
      input: base,
      output: path.join(dir, "base-src"),
      bundle: true,
      dist: path.join(pkg, "dist"),
    });
    await writeFile(
      path.join(pkg, "package.json"),
      JSON.stringify({
        name: "base-proto",
        type: "module",
        exports: { ".": "./dist/index.mjs", "./base": "./dist/base/index.mjs" },
      }),
    );
    const dist = path.join(dir, "dist");
    await generate({
      input: child,
      output: path.join(dir, "generated"),
      bundle: true,
      dist,
      external: { base: importPath },
    });
    const chunks = await Promise.all(
      (await readdir(dist))
        .filter((file) => file.endsWith(".mjs"))
        .map((file) => readFile(path.join(dist, file), "utf8")),
    );
    expect(chunks.join("\n")).not.toContain("EXTERNAL_PACKAGE_ONLY");
    await writeFile(
      path.join(dir, "verify.mjs"),
      `
      import assert from "node:assert/strict";
      import { BinaryReader, BinaryWriter, MessageType } from "@vality/tsthrift";
      import { createChild, base, loadThriftMetadata } from "./dist/child/index.mjs";
      import { loadThriftMetadata as loadRoot } from "./dist/index.mjs";
      assert.equal(base.MARKER, "EXTERNAL_PACKAGE_ONLY");
      assert.deepEqual((await loadThriftMetadata()).map(m => m.name), ["child", "base"]);
      assert.deepEqual((await loadRoot("base")).map(m => m.name), ["base"]);
      const client = createChild({ endpoint: "unused", transport: async bytes => {
        const reader = new BinaryReader(bytes);
        const header = reader.readMessageBegin();
        reader.readFieldBegin();
        assert.equal(reader.readI64(), 42n);
        const writer = new BinaryWriter();
        writer.writeMessageBegin(header.name, MessageType.Reply, header.sequenceId);
        writer.writeFieldBegin(10, 0); writer.writeI64(42n); writer.writeFieldStop();
        return writer.finish();
      }});
      assert.equal(await client.get(42n), 42n);
      assert.equal(await client.echo(42n), 42n);
    `,
    );
    await execute(process.execPath, [path.join(dir, "verify.mjs")]);
  },
);
