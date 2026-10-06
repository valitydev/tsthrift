import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, test } from "vite-plus/test";
import { generate } from "../src/index.ts";
import type { GenerateOptions } from "../src/index.ts";

const execute = promisify(execFile);
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function setup() {
  const directory = await mkdtemp(path.join(tmpdir(), "tsthrift-metadata-entry-"));
  directories.push(directory);
  await writeFile(path.join(directory, "package.json"), '{"type":"module"}');
  await mkdir(path.join(directory, "node_modules/@vality"), { recursive: true });
  await symlink(
    path.resolve(import.meta.dirname, "../../tsthrift"),
    path.join(directory, "node_modules/@vality/tsthrift"),
    "dir",
  );
  const input = path.join(directory, "proto");
  await mkdir(input);
  await writeFile(path.join(input, "common.thrift"), "typedef i64 ID");
  await writeFile(
    path.join(input, "base.thrift"),
    'include "common.thrift"\ntypedef common.ID ID\nservice Base { ID echo(1: ID value) }',
  );
  await writeFile(path.join(input, "unused.thrift"), "struct Unused {}");
  const pkg = path.join(directory, "node_modules/base-proto");
  await generate({
    input,
    output: path.join(directory, "base-generated"),
    dist: path.join(pkg, "dist"),
    bundle: true,
    i64: "number",
  });
  await writeFile(
    path.join(pkg, "package.json"),
    JSON.stringify({
      name: "base-proto",
      version: "1.0.0",
      files: ["dist"],
      type: "module",
      exports: {
        "./*": { types: "./dist/*/index.d.mts", import: "./dist/*/index.mjs" },
        "./*/metadata": {
          types: "./dist/*/load-metadata.d.mts",
          import: "./dist/*/load-metadata.mjs",
        },
      },
    }),
  );
  for (const module of [
    "base/index",
    "base/models",
    "base/services/Base",
    "common/index",
    "common/models",
    "unused/metadata",
  ]) {
    await writeFile(
      path.join(pkg, "dist", `${module}.mjs`),
      'throw new Error("Unwanted module execution");',
    );
  }
  const { stdout } = await execute(
    "npm",
    [
      "pack",
      "--json",
      "--pack-destination",
      directory,
      "--cache",
      path.join(directory, ".npm-cache"),
    ],
    { cwd: pkg },
  );
  const [archive] = JSON.parse(stdout) as { filename: string }[];
  await rm(pkg, { recursive: true });
  await mkdir(pkg);
  await execute("tar", [
    "-xzf",
    path.join(directory, archive!.filename),
    "-C",
    pkg,
    "--strip-components=1",
  ]);
  const child = path.join(directory, "child.thrift");
  await writeFile(child, 'include "base.thrift"\nstruct Child { 1: base.ID id }');
  return {
    directory,
    pkg,
    child,
    output: path.join(directory, "generated"),
    dist: path.join(directory, "dist"),
  };
}

test.each(["package", "namespace", "explicit"] as const)(
  "loads an external metadata closure without executing models or unrelated namespaces (%s)",
  async (mapping) => {
    const { directory, child, output, dist } = await setup();
    const external: GenerateOptions["external"] =
      mapping === "package"
        ? ["base-proto"]
        : {
            base:
              mapping === "explicit"
                ? { importPath: "base-proto/base", metadataPath: "base-proto/base/metadata" }
                : "base-proto/base",
          };
    await generate({ input: child, output, dist, bundle: true, i64: "number", external });
    expect(await readFile(path.join(output, "child/load-metadata.ts"), "utf8")).toContain(
      'import("base-proto/base/metadata")',
    );
    await writeFile(
      path.join(directory, "verify.mjs"),
      `
      import assert from "node:assert/strict";
      import { loadThriftMetadata, TSTHRIFT_BUILD } from "base-proto/base/metadata";
      import { loadThriftMetadataByNamespaces } from "./dist/metadata.mjs";
      assert.equal(TSTHRIFT_BUILD.i64, "number");
      assert.deepEqual((await loadThriftMetadata()).map(m => m.name), ["base", "common"]);
      assert.deepEqual((await loadThriftMetadataByNamespaces("child")).map(m => m.name), ["child", "base", "common"]);
    `,
    );
    await execute(process.execPath, [path.join(directory, "verify.mjs")]);
    await execute(path.resolve(import.meta.dirname, "../node_modules/.bin/tsc"), [
      "-p",
      path.join(output, "tsconfig.json"),
      "--noEmit",
      "--skipLibCheck",
      "false",
    ]);
  },
);

test("propagates errors inside an exported metadata loader without executing the namespace", async () => {
  const { pkg, child, output } = await setup();
  await writeFile(path.join(pkg, "dist/base/load-metadata.mjs"), 'import "./missing.mjs";');
  await expect(generate({ input: child, output, external: ["base-proto"] })).rejects.toThrow(
    "missing.mjs",
  );
});

test("checks build modes through the metadata-only entrypoint", async () => {
  const { child, output, dist } = await setup();
  await expect(
    generate({ input: child, output, dist, bundle: true, external: ["base-proto"] }),
  ).rejects.toThrow(
    "Incompatible or missing TSTHRIFT_BUILD in external package base-proto/base/metadata",
  );
});

test("preserves explicit metadata paths from packages without metadata build markers", async () => {
  const { pkg, child, output, dist } = await setup();
  const manifest = JSON.parse(await readFile(path.join(pkg, "package.json"), "utf8"));
  manifest.exports["./legacy-metadata"] = {
    types: "./dist/base/load-metadata.d.mts",
    import: "./legacy-metadata.mjs",
  };
  await writeFile(path.join(pkg, "package.json"), JSON.stringify(manifest));
  await writeFile(
    path.join(pkg, "legacy-metadata.mjs"),
    'export { loadThriftMetadata } from "./dist/base/load-metadata.mjs";',
  );
  await writeFile(
    path.join(pkg, "dist/base/index.mjs"),
    'export { TSTHRIFT_BUILD } from "../build.mjs";',
  );
  await generate({
    input: child,
    output,
    dist,
    bundle: true,
    i64: "number",
    external: {
      base: { importPath: "base-proto/base", metadataPath: "base-proto/legacy-metadata" },
    },
  });
  expect(await readFile(path.join(output, "child/load-metadata.ts"), "utf8")).toContain(
    'import("base-proto/legacy-metadata")',
  );
});
