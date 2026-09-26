import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { cp, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, expect, test } from "vite-plus/test";
import { generate } from "../src/index.ts";
import type { Metadata } from "../src/index.ts";

const execute = promisify(execFile);
const tsc = path.resolve(
  path.dirname(createRequire(import.meta.url).resolve("typescript")),
  "../bin/tsc",
);
const compiler = process.env.THRIFT_COMPILER;
const integration = test.skipIf(!compiler);
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function setup() {
  const directory = await mkdtemp(path.join(tmpdir(), "tsthrift integration "));
  directories.push(directory);
  await symlink(
    path.resolve(import.meta.dirname, "../node_modules"),
    path.join(directory, "node_modules"),
    "dir",
  );
  await cp(path.join(import.meta.dirname, "fixtures"), directory, { recursive: true });
  return {
    input: path.join(directory, "proto"),
    includes: [path.join(directory, "dependency")],
    output: path.join(directory, "generated"),
    compiler,
    target: "apache" as const,
  };
}

integration.each(["number", "bigint"] as const)(
  "generates real bigint JS and type-checkable %s-based models with external includes",
  async (i64) => {
    const options = await setup();
    const result = await generate({ ...options, i64 });
    expect(result.compilerVersion).toBe("Thrift version 0.24.0");
    expect(result.modules.sort()).toEqual(["common", "example"]);
    expect(
      JSON.parse(await readFile(path.join(options.output, "generation.json"), "utf8")),
    ).toMatchObject({ generator: "js:node,es6,bigint" });
    const js = await readFile(path.join(options.output, "internal/example_types.js"), "utf8");
    expect(js).toContain("thrift.toBigInt(input.readI64())");
    expect(js).toContain("output.writeI64(thrift.fromBigInt(this.id))");
    expect(js).toContain("42n");
    for (const file of await readdir(path.join(options.output, "internal"))) {
      if (file.endsWith(".js"))
        await execute(process.execPath, ["--check", path.join(options.output, "internal", file)]);
    }
    const models = path.join(options.output, "models");
    await execute(process.execPath, [
      tsc,
      "--ignoreConfig",
      "--noEmit",
      "--strict",
      "--skipLibCheck",
      "--target",
      "es2020",
      "--module",
      "nodenext",
      path.join(models, "example.ts"),
      path.join(models, "common.ts"),
    ]);
    const metadataText = await readFile(path.join(options.output, "metadata.json"), "utf8");
    const metadata = JSON.parse(metadataText) as Metadata[];
    expect(metadata.find((entry) => entry.name === "common")?.path).toBe("shared/common.thrift");
    expect(metadata.find((entry) => entry.name === "example")?.ast.struct?.Empty).toEqual([]);
    await generate(options);
    expect(await readFile(path.join(options.output, "metadata.json"), "utf8")).toBe(metadataText);
  },
);

integration("preserves previous output when the actual compiler rejects IDL", async () => {
  const options = await setup();
  await generate(options);
  const before = await readFile(path.join(options.output, "metadata.json"), "utf8");
  await writeFile(
    path.join(options.input, "broken.thrift"),
    'struct Broken { 1: i32 value = "invalid" }',
  );
  await expect(generate(options)).rejects.toThrow("Thrift compiler failed");
  expect(await readFile(path.join(options.output, "metadata.json"), "utf8")).toBe(before);
});

integration("invokes the CLI with paths containing spaces", async () => {
  const options = await setup();
  const result = await execute(process.execPath, [
    path.resolve(import.meta.dirname, "../src/cli.ts"),
    "--input",
    options.input,
    "--output",
    options.output,
    "--include",
    options.includes[0]!,
    "--compiler",
    compiler!,
    "--target",
    "apache",
    "--namespace",
    "example",
  ]);
  expect(result.stdout).toContain("generated 2 module(s)");
  expect(await readdir(options.output)).toContain("metadata.json");
});

integration(
  "executes callback-named IDL arguments and declared errors with official ES6 JS",
  async () => {
    const options = await setup();
    await writeFile(
      path.join(options.input, "callback.thrift"),
      `
    exception Failure { 1: string reason }
    service Callback {
      i64 invoke(1: i64 callback, 2: i64 callback1, 3: i64 _callback) throws (1: Failure failure)
    }
  `,
    );
    await generate({ ...options, namespaces: ["callback"] });
    const { stdout } = await execute(process.execPath, [
      path.join(import.meta.dirname, "reference/apache-callback.cjs"),
      path.join(options.output, "internal/Callback.js"),
      path.join(options.output, "internal/callback_types.js"),
    ]);
    expect(JSON.parse(stdout)).toEqual([
      ["9007199254740993", "2", "3"],
      ["-1", "0", "0"],
    ]);
  },
);
