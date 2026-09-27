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
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function setup() {
  const directory = await mkdtemp(path.join(tmpdir(), "tsthrift-gen-"));
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
  };
}

test.each(["number", "bigint"] as const)(
  "generates models and metadata.json by default with external includes (%s mode)",
  async (i64) => {
    const options = await setup();
    const result = await generate({ ...options, i64 });

    expect(result.models).toBe(true);
    expect(result.modules.sort()).toEqual(["common", "example"]);

    const generation = JSON.parse(
      await readFile(path.join(options.output, "generation.json"), "utf8"),
    );
    expect(generation).toEqual({
      target: "models",
      i64,
      models: true,
      namespaces: ["example"],
    });

    const files = await readdir(options.output);
    expect(files.sort()).toEqual([
      ".tsthrift.json",
      "generation.json",
      "index.ts",
      "metadata.json",
      "models",
    ]);

    const modelsDir = path.join(options.output, "models");
    const modelFiles = await readdir(modelsDir);
    expect(modelFiles.sort()).toEqual(["common.ts", "example.ts"]);

    // Verify TypeScript type checking on generated models
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
      path.join(modelsDir, "example.ts"),
      path.join(modelsDir, "common.ts"),
    ]);

    const metadataText = await readFile(path.join(options.output, "metadata.json"), "utf8");
    const metadata = JSON.parse(metadataText) as Metadata[];
    expect(metadata.find((entry) => entry.name === "common")?.path).toBe("shared/common.thrift");
    expect(metadata.find((entry) => entry.name === "example")?.ast.struct?.Empty).toEqual([]);
  },
);

test("generates only metadata when models is disabled via models: false", async () => {
  const options = await setup();
  const result = await generate({ ...options, models: false });

  expect(result.models).toBe(false);
  expect(result.modules.sort()).toEqual(["common", "example"]);

  const files = await readdir(options.output);
  expect(files.sort()).toEqual([".tsthrift.json", "generation.json", "metadata.json"]);

  const generation = JSON.parse(
    await readFile(path.join(options.output, "generation.json"), "utf8"),
  );
  expect(generation).toEqual({
    target: "metadata",
    i64: "bigint",
    models: false,
    namespaces: ["example"],
  });
});

test("preserves previous output when generation fails", async () => {
  const options = await setup();
  await generate(options);
  const before = await readFile(path.join(options.output, "metadata.json"), "utf8");

  await writeFile(path.join(options.input, "broken.thrift"), "struct Broken { 1: i32 a 1: i32 b }");

  await expect(generate(options)).rejects.toThrow("Duplicate field ID");
  expect(await readFile(path.join(options.output, "metadata.json"), "utf8")).toBe(before);
});

test("CLI generates models and metadata by default", async () => {
  const options = await setup();
  const result = await execute(process.execPath, [
    path.resolve(import.meta.dirname, "../src/cli.ts"),
    "--input",
    options.input,
    "--output",
    options.output,
    "--include",
    options.includes[0]!,
    "--namespace",
    "example",
  ]);

  expect(result.stdout).toContain("generated 2 module(s)");
  const files = await readdir(options.output);
  expect(files).toContain("metadata.json");
  expect(files).toContain("models");
  expect(files).toContain("index.ts");
});

test("CLI generates only metadata when --no-models is passed", async () => {
  const options = await setup();
  const result = await execute(process.execPath, [
    path.resolve(import.meta.dirname, "../src/cli.ts"),
    "--input",
    options.input,
    "--output",
    options.output,
    "--include",
    options.includes[0]!,
    "--namespace",
    "example",
    "--no-models",
  ]);

  expect(result.stdout).toContain("generated 2 module(s)");
  const files = await readdir(options.output);
  expect(files).toContain("metadata.json");
  expect(files).not.toContain("models");
  expect(files).not.toContain("index.ts");
});
