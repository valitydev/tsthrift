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

test.each([
  ["base-proto", "bigint", false],
  ["base-proto/base", "bigint", false],
  ["base-proto", "number", false],
  ["base-proto/base", "number", false],
  ["base-proto", "bigint", true],
  ["base-proto/base", "bigint", true],
  ["base-proto", "number", true],
  ["base-proto/base", "number", true],
] as const)(
  "executes generated external imports through %s in %s mode without inlining (direct common: %s)",
  async (importPath, i64, directCommon) => {
    const dir = await mkdtemp(path.join(tmpdir(), "tsthrift-external-package-"));
    directories.push(dir);
    await writeFile(path.join(dir, "package.json"), '{"type":"module"}');
    await mkdir(path.join(dir, "node_modules/@vality"), { recursive: true });
    await symlink(
      path.resolve(import.meta.dirname, "../../tsthrift"),
      path.join(dir, "node_modules/@vality/tsthrift"),
      "dir",
    );
    await writeFile(path.join(dir, "common.thrift"), "struct Data { 1: required i64 value }");
    const base = path.join(dir, "base.thrift");
    const child = path.join(dir, "child.thrift");
    await writeFile(
      base,
      'include "common.thrift"\nconst string MARKER = "EXTERNAL_PACKAGE_ONLY"\nservice Base { i64 get(1: i64 value) }',
    );
    await writeFile(
      child,
      `include "base.thrift"\n${directCommon ? 'include "common.thrift"\n' : ""}service Child extends base.Base { i64 echo(1: i64 value) }`,
    );
    const pkg = path.join(dir, "node_modules/base-proto");
    await generate({
      input: base,
      i64,
      main: "base",
      output: path.join(dir, "base-src"),
      bundle: true,
      dist: path.join(pkg, "dist"),
    });
    await writeFile(
      path.join(pkg, "package.json"),
      JSON.stringify({
        name: "base-proto",
        type: "module",
        exports: {
          ".": { import: "./dist/index.mjs" },
          "./base": { import: "./dist/base/index.mjs" },
          "./common": { import: "./dist/common/index.mjs" },
        },
      }),
    );
    const dist = path.join(dir, "dist");
    await expect(
      generate({
        input: child,
        output: path.join(dir, "mismatched"),
        bundle: true,
        dist: path.join(dir, "mismatched-dist"),
        i64: i64 === "bigint" ? "number" : "bigint",
        external: { base: importPath, common: "base-proto/common" },
      }),
    ).rejects.toThrow("Incompatible or missing TSTHRIFT_BUILD");
    await expect(
      generate({
        input: child,
        i64,
        binary: "uint8array",
        output: path.join(dir, "binary-mismatched"),
        bundle: true,
        dist: path.join(dir, "binary-mismatched-dist"),
        external: { base: importPath, common: "base-proto/common" },
      }),
    ).rejects.toThrow("Incompatible or missing TSTHRIFT_BUILD");
    await generate({
      input: child,
      i64,
      output: path.join(dir, "generated"),
      bundle: true,
      dist,
      external: { base: importPath, common: "base-proto/common" },
    });
    const chunks = await Promise.all(
      (await readdir(dist, { recursive: true }))
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
      import { THRIFT_NAMESPACES, EXTERNAL_NAMESPACES, loadThriftMetadataByNamespaces as loadRoot } from "./dist/index.mjs";
      assert.deepEqual(THRIFT_NAMESPACES, ${JSON.stringify(directCommon ? ["base", "child", "common"] : ["base", "child"])});
      assert.deepEqual(Object.keys(EXTERNAL_NAMESPACES).sort(), ${JSON.stringify(directCommon ? ["base", "common"] : ["base"])});
      for (const namespace of THRIFT_NAMESPACES) {
        assert.ok((await loadRoot(namespace)).some(m => m.name === namespace));
      }
      assert.deepEqual((await loadRoot(["child", "base", "child"])).map(m => m.name), ["child", "base", "common"]);
      assert.deepEqual((await loadRoot(THRIFT_NAMESPACES)).map(m => m.name), ["base", "common", "child"]);
      ${directCommon ? "" : 'await assert.rejects(loadRoot("common"), /Unknown metadata namespace: common/);'}
      assert.equal(base.MARKER, "EXTERNAL_PACKAGE_ONLY");
      assert.deepEqual((await loadThriftMetadata()).map(m => m.name), ["child", "base", "common"]);
      assert.deepEqual((await loadRoot("base")).map(m => m.name), ["base", "common"]);
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
      const value = ${i64 === "bigint" ? "42n" : "42"};
      assert.equal(await client.get(value), value);
      assert.equal(await client.echo(value), value);
    `,
    );
    await execute(process.execPath, [path.join(dir, "verify.mjs")]);
  },
);
