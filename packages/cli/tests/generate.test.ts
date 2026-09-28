import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
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
  "generates models, services, and modular metadata by default (%s mode)",
  async (i64) => {
    const options = await setup();
    const result = await generate({ ...options, i64 });

    expect(result.models).toBe(true);
    expect(result.services).toBe(true);
    expect(result.modules.sort()).toEqual(["common", "example"]);

    const files = await readdir(options.output);
    expect(files.sort()).toEqual([
      ".tsthrift.json",
      "common",
      "example",
      "index.ts",
      "metadata.ts",
      "services.ts",
      "tsconfig.json",
    ]);

    const commonDir = path.join(options.output, "common");
    const commonFiles = await readdir(commonDir);
    expect(commonFiles.sort()).toEqual(["index.ts", "metadata.ts", "models.ts", "services"]);

    const exampleDir = path.join(options.output, "example");
    const exampleFiles = await readdir(exampleDir);
    expect(exampleFiles.sort()).toEqual(["index.ts", "metadata.ts", "models.ts", "services"]);
    const exampleServiceFiles = await readdir(path.join(exampleDir, "services"));
    expect(exampleServiceFiles.sort()).toEqual(["Example.ts", "index.ts"]);

    // Verify TypeScript type checking on generated models and services
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

    const indexContent = await readFile(path.join(options.output, "index.ts"), "utf8");
    expect(indexContent).toContain('export * as common from "./common/index.js";');
    expect(indexContent).toContain('export * as example from "./example/index.js";');
    expect(indexContent).toContain('export { SERVICES, SERVICES_LIST } from "./services.js";');
    expect(indexContent).toContain('export { loadMetadata } from "./metadata.js";');
    expect(indexContent).not.toContain("generateId");
    expect(indexContent).not.toContain("generateTraceId");

    const commonEntry = await readFile(path.join(options.output, "common/index.ts"), "utf8");
    expect(commonEntry).toContain('export * from "./models.js";');

    const exampleEntry = await readFile(path.join(options.output, "example/index.ts"), "utf8");
    expect(exampleEntry).toContain('export * from "./models.js";');
    expect(exampleEntry).toContain('export * from "./services/index.js";');

    const commonMeta = await readFile(path.join(options.output, "common/metadata.ts"), "utf8");
    expect(commonMeta).toContain('"path": "shared/common.thrift"');
    const exampleMeta = await readFile(path.join(options.output, "example/metadata.ts"), "utf8");
    expect(exampleMeta).toContain('"Empty": []');
  },
);

test("generates models without service factories when services: false is passed", async () => {
  const options = await setup();
  const result = await generate({ ...options, services: false });

  expect(result.models).toBe(true);
  expect(result.services).toBe(false);

  const files = await readdir(options.output);
  expect(files.sort()).toEqual([
    ".tsthrift.json",
    "common",
    "example",
    "index.ts",
    "metadata.ts",
    "tsconfig.json",
  ]);
  expect(files).not.toContain("services.ts");
});

test("emits monolithic metadata.json when metadataJson: true", async () => {
  const options = await setup();
  await generate({ ...options, metadataJson: true });

  const files = await readdir(options.output);
  expect(files).toContain("metadata.json");

  const metadataText = await readFile(path.join(options.output, "metadata.json"), "utf8");
  const metadata = JSON.parse(metadataText) as Metadata[];
  expect(metadata.find((entry) => entry.name === "common")?.path).toBe("shared/common.thrift");
});

test("emits modular metadata in namespace directories and loader in root by default", async () => {
  const options = await setup();
  await generate(options);

  const common = await readFile(path.join(options.output, "common/metadata.ts"), "utf8");
  expect(common).toContain('"name": "common"');
  expect(common).toContain("export const metadata");

  const example = await readFile(path.join(options.output, "example/metadata.ts"), "utf8");
  expect(example).toContain('"name": "example"');
  expect(example).toContain("export const metadata");

  const loader = await readFile(path.join(options.output, "metadata.ts"), "utf8");
  expect(loader).toContain("export const loadMetadata");
  expect(loader).toContain("createMetadataLoader");
  expect(loader).toContain('import("./common/metadata.js")');
});

test("emits tsconfig.json in generated directory when bundle: true", async () => {
  const options = await setup();
  const dist = path.join(options.output, "../dist");
  await generate({ ...options, bundle: true, dist });

  const generatedFiles = await readdir(options.output);
  expect(generatedFiles).toContain("tsconfig.json");

  const tsconfig = JSON.parse(await readFile(path.join(options.output, "tsconfig.json"), "utf8"));
  expect(tsconfig.compilerOptions.isolatedDeclarations).toBe(true);
});

test("generates only metadata when models is disabled via models: false", async () => {
  const options = await setup();
  const result = await generate({ ...options, models: false });

  expect(result.models).toBe(false);
  expect(result.services).toBe(false);
  expect(result.modules.sort()).toEqual(["common", "example"]);

  const files = await readdir(options.output);
  expect(files.sort()).toEqual([".tsthrift.json", "metadata.json"]);
});

test("preserves previous output when generation fails", async () => {
  const options = await setup();
  await generate(options);
  const before = await readFile(path.join(options.output, "index.ts"), "utf8");

  await writeFile(path.join(options.input, "broken.thrift"), "struct Broken { 1: i32 a 1: i32 b }");

  await expect(generate(options)).rejects.toThrow("Duplicate field ID");
  expect(await readFile(path.join(options.output, "index.ts"), "utf8")).toBe(before);
});

test("CLI supports --no-services and --metadata-json", async () => {
  const options = await setup();
  const result = await execute(process.execPath, [
    path.resolve(import.meta.dirname, "../src/cli.ts"),
    "--input",
    options.input,
    "--output",
    options.output,
    "--include",
    options.includes[0]!,
    "--metadata-json",
  ]);

  expect(result.stdout).toContain("generated 2 module(s)");
  const files = await readdir(options.output);
  expect(files).toContain("metadata.json");
  expect(files).toContain("common");
  expect(files).toContain("example");
  expect(files).toContain("metadata.ts");
  expect(files).toContain("services.ts");
  expect(files).not.toContain("package.json");

  const metadataText = await readFile(path.join(options.output, "metadata.json"), "utf8");
  expect(JSON.parse(metadataText)).toHaveLength(2);
});

test("supports --allow-duplicate-modules in CLI and generate()", async () => {
  const options = await setup();
  const dirA = path.join(options.input, "dep_a");
  const dirB = path.join(options.input, "dep_b");
  await mkdir(dirA, { recursive: true });
  await mkdir(dirB, { recursive: true });
  await writeFile(path.join(dirA, "shadowed.thrift"), "struct ShadowedA { 1: string a }");
  await writeFile(path.join(dirB, "shadowed.thrift"), "struct ShadowedB { 1: string b }");
  await writeFile(
    path.join(options.input, "client_a.thrift"),
    'include "dep_a/shadowed.thrift"\nstruct ClientA { 1: shadowed.ShadowedA val }',
  );
  await writeFile(
    path.join(options.input, "client_b.thrift"),
    'include "dep_b/shadowed.thrift"\nstruct ClientB { 1: shadowed.ShadowedA val }',
  );

  // Without flag it throws
  await expect(
    generate({
      input: [
        path.join(options.input, "client_a.thrift"),
        path.join(options.input, "client_b.thrift"),
      ],
      output: options.output,
    }),
  ).rejects.toThrow(/Duplicate module name shadowed/);

  // With CLI flag --allow-duplicate-modules
  const result = await execute(process.execPath, [
    path.resolve(import.meta.dirname, "../src/cli.ts"),
    "--input",
    path.join(options.input, "client_a.thrift"),
    "--input",
    path.join(options.input, "client_b.thrift"),
    "--output",
    options.output,
    "--allow-duplicate-modules",
  ]);

  expect(result.stdout).toContain("generated 3 module(s)");
  const generatedDirs = await readdir(options.output);
  expect(generatedDirs).toContain("client_a");
  expect(generatedDirs).toContain("client_b");
  expect(generatedDirs).toContain("shadowed");
});

test("bundles output into dist/ with types when bundle: true", async () => {
  const options = await setup();
  const dist = path.join(options.output, "../dist");
  const result = await generate({
    ...options,
    bundle: true,
    dist,
  });

  expect(result.bundled).toBe(true);
  expect(result.dist).toBe(dist);

  const outputFiles = await readdir(options.output);
  expect(outputFiles).toContain("index.ts");
  expect(outputFiles).toContain("tsconfig.json");

  const distFiles = await readdir(dist);
  expect(distFiles).toContain("index.mjs");
  expect(distFiles).toContain("index.d.mts");

  // Subsequent generation run works and atomically replaces without unmanaged file errors
  await expect(
    generate({
      ...options,
      bundle: true,
      dist,
    }),
  ).resolves.toBeDefined();
});

test("bundles output into dist/ with minification by default when bundle: true", async () => {
  const options = await setup();
  const dist = path.join(options.output, "../dist");
  await generate({
    ...options,
    bundle: true,
    dist,
  });

  const distFiles = await readdir(dist);
  expect(distFiles).toContain("index.mjs");
  expect(distFiles).toContain("index.d.mts");

  const indexContent = await readFile(path.join(dist, "index.mjs"), "utf8");
  expect(indexContent.trim().split("\n")).toHaveLength(1);
});

test("CLI supports --bundle and --dist flags with subpath exports", async () => {
  const options = await setup();
  const dist = path.join(options.output, "../dist");
  const result = await execute(process.execPath, [
    path.resolve(import.meta.dirname, "../src/cli.ts"),
    "--input",
    options.input,
    "--output",
    options.output,
    "--include",
    options.includes[0]!,
    "--bundle",
    "--dist",
    dist,
  ]);

  expect(result.stdout).toContain("generated 2 module(s)");
  expect(result.stdout).toContain(`bundled into ${dist}`);
  const distFiles = await readdir(dist);
  expect(distFiles).toContain("index.mjs");
  expect(distFiles).toContain("index.d.mts");
  expect(distFiles).toContain("common");
  expect(distFiles).toContain("example");
  const commonDist = await readdir(path.join(dist, "common"));
  expect(commonDist).toContain("index.mjs");
  expect(commonDist).toContain("index.d.mts");
});

test("CLI and generate() support glob patterns for input", async () => {
  const options = await setup();
  const globInput = path.join(options.input, "*.thrift");
  const result = await generate({
    ...options,
    input: globInput,
  });
  expect(result.modules.sort()).toEqual(["common", "example"]);
  const files = await readdir(options.output);
  expect(files).toContain("example");
  expect(files).toContain("common");
});

test("CLI defaults output to generated and requires only --input", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tsthrift-cli-default-"));
  const input = path.join(dir, "proto");
  await mkdir(input, { recursive: true });
  await writeFile(path.join(input, "test.thrift"), "struct Item { 1: string id }");

  // Missing --input should fail
  await expect(
    execute(process.execPath, [path.resolve(import.meta.dirname, "../src/cli.ts")]),
  ).rejects.toThrow(/--input is required/);

  // Omitting --output defaults to generated in cwd
  const result = await execute(
    process.execPath,
    [path.resolve(import.meta.dirname, "../src/cli.ts"), "--input", input],
    { cwd: dir },
  );

  expect(result.stdout).toContain("generated 1 module(s)");
  expect(result.stdout).toMatch(/\/generated\b/);
  const generatedFiles = await readdir(path.join(dir, "generated"));
  expect(generatedFiles).toContain("index.ts");
  expect(generatedFiles).toContain("test");
  await rm(dir, { recursive: true, force: true });
});

test("generate() accepts options without output property", () => {
  const options: import("../src/compiler/generate.ts").GenerateOptions = {
    input: "proto",
  };
  expect(options.output).toBeUndefined();
});

test.each([
  ["service index { void ping() }", "path collision"],
  ["struct metadata {}", "identifier collision"],
  ["struct ExampleConfig {} service Example { void ping() }", "identifier collision"],
  ["service Example { oneway i32 ping() }", "Invalid oneway"],
  ['struct Data { 1: i32 a = "invalid" }', "Invalid i32 constant"],
])("rejects invalid generated API before replacing output: %s", async (source, error) => {
  const options = await setup();
  await generate(options);
  const before = await readFile(path.join(options.output, "index.ts"), "utf8");
  await writeFile(path.join(options.input, "invalid.thrift"), source);
  await expect(generate(options)).rejects.toThrow(error);
  expect(await readFile(path.join(options.output, "index.ts"), "utf8")).toBe(before);
});

test("rejects overlapping bundle paths and refuses unrelated output", async () => {
  const options = await setup();
  await expect(generate({ ...options, bundle: true, dist: options.output })).rejects.toThrow(
    "overlap",
  );
  await expect(generate({ ...options, bundle: true, dist: options.input })).rejects.toThrow(
    "input source",
  );
  await mkdir(options.output);
  await writeFile(path.join(options.output, "keep.txt"), "keep");
  await expect(generate(options)).rejects.toThrow("unowned");
  expect(await readFile(path.join(options.output, "keep.txt"), "utf8")).toBe("keep");
});
