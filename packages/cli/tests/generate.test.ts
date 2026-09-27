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
  "generates models, clients, and metadata.json by default (%s mode)",
  async (i64) => {
    const options = await setup();
    const result = await generate({ ...options, i64 });

    expect(result.models).toBe(true);
    expect(result.clients).toBe(true);
    expect(result.modules.sort()).toEqual(["common", "example"]);

    const generation = JSON.parse(
      await readFile(path.join(options.output, "generation.json"), "utf8"),
    );
    expect(generation).toEqual({
      target: "models",
      i64,
      models: true,
      clients: true,
      minify: false,
      splitMetadata: false,
      namespaces: ["example"],
    });

    const files = await readdir(options.output);
    expect(files.sort()).toEqual([
      ".tsthrift.json",
      "clients",
      "generation.json",
      "index.ts",
      "metadata.json",
      "models",
    ]);

    const modelsDir = path.join(options.output, "models");
    const modelFiles = await readdir(modelsDir);
    expect(modelFiles.sort()).toEqual(["common.ts", "example.ts"]);

    const clientsDir = path.join(options.output, "clients");
    const clientFiles = await readdir(clientsDir);
    expect(clientFiles.sort()).toEqual(["common", "example", "index.ts", "services.ts"]);
    const exampleClientFiles = await readdir(path.join(clientsDir, "example"));
    expect(exampleClientFiles.sort()).toEqual(["Example.ts", "index.ts"]);

    // Verify TypeScript type checking on generated models and clients
    try {
      await execute(process.execPath, [
        tsc,
        "--ignoreConfig",
        "--noEmit",
        "--strict",
        "--skipLibCheck",
        "--target",
        "es2022",
        "--module",
        "nodenext",
        "--resolveJsonModule",
        path.join(options.output, "index.ts"),
      ]);
    } catch (error: any) {
      throw new Error(`tsc failed: ${error.stdout}\n${error.stderr}`);
    }

    const metadataText = await readFile(path.join(options.output, "metadata.json"), "utf8");
    const metadata = JSON.parse(metadataText) as Metadata[];
    expect(metadata.find((entry) => entry.name === "common")?.path).toBe("shared/common.thrift");
    expect(metadata.find((entry) => entry.name === "example")?.ast.struct?.Empty).toEqual([]);
  },
);

test("generates models without client factories when clients: false is passed", async () => {
  const options = await setup();
  const result = await generate({ ...options, clients: false });

  expect(result.models).toBe(true);
  expect(result.clients).toBe(false);

  const files = await readdir(options.output);
  expect(files.sort()).toEqual([
    ".tsthrift.json",
    "generation.json",
    "index.ts",
    "metadata.json",
    "models",
  ]);
  expect(files).not.toContain("clients");
});

test("generates minified metadata when minify: true", async () => {
  const options = await setup();
  await generate({ ...options, minify: true });

  const metadataText = await readFile(path.join(options.output, "metadata.json"), "utf8");
  // Minified JSON contains only the trailing newline
  expect(metadataText.trim().split("\n")).toHaveLength(1);
  expect(JSON.parse(metadataText)).toHaveLength(2);
});

test("splits metadata per module when splitMetadata: true", async () => {
  const options = await setup();
  await generate({ ...options, splitMetadata: true });

  const metadataDir = path.join(options.output, "metadata");
  const files = await readdir(metadataDir);
  expect(files.sort()).toEqual(["common.json", "example.json"]);

  const common = JSON.parse(await readFile(path.join(metadataDir, "common.json"), "utf8"));
  expect(common).toHaveLength(1);
  expect(common[0].name).toBe("common");
});

test("emits package.json and tsconfig.json when package: true", async () => {
  const options = await setup();
  await generate({ ...options, package: true, packageName: "@vality/proto-example" });

  const files = await readdir(options.output);
  expect(files).toContain("package.json");
  expect(files).toContain("tsconfig.json");

  const pkg = JSON.parse(await readFile(path.join(options.output, "package.json"), "utf8"));
  expect(pkg.name).toBe("@vality/proto-example");
  expect(pkg.type).toBe("module");
  expect(pkg.peerDependencies["@vality/tsthrift"]).toBeDefined();
});

test("generates only metadata when models is disabled via models: false", async () => {
  const options = await setup();
  const result = await generate({ ...options, models: false });

  expect(result.models).toBe(false);
  expect(result.clients).toBe(false);
  expect(result.modules.sort()).toEqual(["common", "example"]);

  const files = await readdir(options.output);
  expect(files.sort()).toEqual([".tsthrift.json", "generation.json", "metadata.json"]);
});

test("preserves previous output when generation fails", async () => {
  const options = await setup();
  await generate(options);
  const before = await readFile(path.join(options.output, "metadata.json"), "utf8");

  await writeFile(path.join(options.input, "broken.thrift"), "struct Broken { 1: i32 a 1: i32 b }");

  await expect(generate(options)).rejects.toThrow("Duplicate field ID");
  expect(await readFile(path.join(options.output, "metadata.json"), "utf8")).toBe(before);
});

test("CLI supports --no-clients, --minify, --split-metadata, and --package", async () => {
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
    "--minify",
    "--split-metadata",
    "--package",
    "--package-name",
    "@custom/test-pkg",
  ]);

  expect(result.stdout).toContain("generated 2 module(s)");
  const files = await readdir(options.output);
  expect(files).toContain("metadata.json");
  expect(files).toContain("models");
  expect(files).toContain("clients");
  expect(files).toContain("metadata");
  expect(files).toContain("package.json");
  expect(files).toContain("tsconfig.json");

  const metadataText = await readFile(path.join(options.output, "metadata.json"), "utf8");
  expect(metadataText.trim().split("\n")).toHaveLength(1);
});
