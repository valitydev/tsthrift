import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, expect, test } from "vite-plus/test";
import { generate } from "../src/index.ts";
import type { Metadata } from "@vality/tsthrift";

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
      "build.ts",
      "common",
      "example",
      "index.ts",
      "metadata.ts",
      "services.ts",
      "tsconfig.json",
    ]);

    const commonDir = path.join(options.output, "common");
    const commonFiles = await readdir(commonDir);
    expect(commonFiles.sort()).toEqual([
      "index.ts",
      "load-metadata.ts",
      "metadata.ts",
      "models.ts",
      "services",
    ]);

    const exampleDir = path.join(options.output, "example");
    const exampleFiles = await readdir(exampleDir);
    expect(exampleFiles.sort()).toEqual([
      "index.ts",
      "load-metadata.ts",
      "metadata.ts",
      "models.ts",
      "services",
    ]);
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
    expect(indexContent).not.toContain("export * as common");
    expect(indexContent).toContain(
      'export { THRIFT_SERVICES, THRIFT_SERVICES_LIST } from "./services.js";',
    );
    expect(indexContent).toContain('export { loadThriftMetadata } from "./metadata.js";');
    expect(indexContent).not.toContain("generateId");
    expect(indexContent).not.toContain("generateTraceId");

    const commonEntry = await readFile(path.join(options.output, "common/index.ts"), "utf8");
    expect(commonEntry).toContain('export * from "./models.js";');
    expect(commonEntry).toContain('export { thriftMetadata } from "./metadata.js";');
    expect(commonEntry).toContain('export { loadThriftMetadata } from "./load-metadata.js";');

    const exampleEntry = await readFile(path.join(options.output, "example/index.ts"), "utf8");
    expect(exampleEntry).toContain('export * from "./models.js";');
    expect(exampleEntry).toContain('export * from "./services/index.js";');

    const exampleService = await readFile(path.join(exampleDir, "services/Example.ts"), "utf8");
    expect(exampleService).not.toContain("readonly safe");
    expect(exampleService).not.toContain("createExampleSafe");
    expect(exampleService).toContain("export interface ExampleErrors extends common_BaseErrors {");
    expect(exampleService).toContain("readonly [THRIFT_ERRORS]?: ExampleErrors;");
    expect(exampleService).not.toContain("THRIFT_RESULT");
    expect(exampleService).toContain("export type ExampleEchoError =");
    expect(exampleService).toContain("export type ExampleEchoServiceError =");

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
    "build.ts",
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
  expect(common).toContain("export const thriftMetadata");

  const example = await readFile(path.join(options.output, "example/metadata.ts"), "utf8");
  expect(example).toContain('"name": "example"');
  expect(example).toContain("export const thriftMetadata");

  const commonLoader = await readFile(path.join(options.output, "common/load-metadata.ts"), "utf8");
  expect(commonLoader).toContain("export const loadThriftMetadata");
  expect(commonLoader).toContain('import("./metadata.js")');

  const exampleLoader = await readFile(
    path.join(options.output, "example/load-metadata.ts"),
    "utf8",
  );
  expect(exampleLoader).toContain("export const loadThriftMetadata");
  expect(exampleLoader).toContain('import("../common/metadata.js")');

  const loader = await readFile(path.join(options.output, "metadata.ts"), "utf8");
  expect(loader).toContain("export const loadThriftMetadata");
  expect(loader).toContain('import("./common/load-metadata.js")');
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
  expect(outputFiles).toContain(".tsthrift.json");

  const distFiles = await readdir(dist);
  expect(distFiles).toContain("index.mjs");
  expect(distFiles).toContain("index.d.mts");
  expect(distFiles).toContain(".tsthrift.json");

  // Subsequent generation run works and atomically replaces without unmanaged file errors
  await expect(
    generate({
      ...options,
      bundle: true,
      dist,
    }),
  ).resolves.toBeDefined();
});

test("bundles into dist/ without source maps by default", async () => {
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
  expect(distFiles).not.toContain("index.mjs.map");
  expect(await readFile(path.join(dist, "index.mjs"), "utf8")).not.toContain("sourceMappingURL");
});

test("supports sourcemap: true when bundling", async () => {
  const options = await setup();
  const dist = path.join(options.output, "../dist");
  await generate({ ...options, bundle: true, dist, sourcemap: true });

  expect(await readdir(path.join(dist, "example"))).toContain("models.mjs.map");
  const map = JSON.parse(await readFile(path.join(dist, "example/models.mjs.map"), "utf8"));
  expect(map.sourcesContent?.length).toBeGreaterThan(0);
  expect(await readFile(path.join(dist, "example/models.mjs"), "utf8")).toContain(
    "sourceMappingURL=models.mjs.map",
  );
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

test("CLI supports --bundle with the --sourcemap flag", async () => {
  const options = await setup();
  const dist = path.join(options.output, "../dist");
  await execute(process.execPath, [
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
    "--sourcemap",
  ]);

  const distFiles = await readdir(dist);
  expect(distFiles).toContain("index.mjs");
  expect(distFiles).toContain("index.d.mts");
  expect(await readdir(path.join(dist, "example"))).toContain("models.mjs.map");
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
  ["struct Promise {}", "identifier collision"],
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

test("re-exports main module at root when specified", async () => {
  const options = await setup();
  await generate({ ...options, main: "example" });

  const indexContent = await readFile(path.join(options.output, "index.ts"), "utf8");
  expect(indexContent).toContain('export * from "./example/index.js";');
  expect(indexContent).toContain("THRIFT_SERVICES");
});

test("throws when specified main module does not exist in schema", async () => {
  const options = await setup();
  await expect(generate({ ...options, main: "nonexistent" })).rejects.toThrow(
    'Main module "nonexistent" not found in schema',
  );
});

test("automatically re-exports single module at root index", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tsthrift-single-"));
  directories.push(dir);
  const input = path.join(dir, "proto");
  const output = path.join(dir, "generated");
  await mkdir(input, { recursive: true });
  await writeFile(path.join(input, "single.thrift"), "struct Item { 1: string id }");

  await generate({ input, output });

  const indexContent = await readFile(path.join(output, "index.ts"), "utf8");
  expect(indexContent).toContain('export * from "./single/index.js";');
});

test("sanitizes reserved parameter names in service method signatures", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tsthrift-reserved-param-"));
  directories.push(dir);
  const input = path.join(dir, "proto");
  const output = path.join(dir, "generated");
  await mkdir(input, { recursive: true });
  await writeFile(
    path.join(input, "test.thrift"),
    "service TestService { void remove(1: string default, 2: i32 delete) }",
  );

  await generate({ input, output });

  const serviceContent = await readFile(path.join(output, "test/services/TestService.ts"), "utf8");
  expect(serviceContent).toContain(
    '"remove"(_default: string, _delete: number, options?: ThriftRequestOptions): Promise<void>;',
  );
});

test("allows service method named safe without collision", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tsthrift-safe-method-"));
  directories.push(dir);
  const input = path.join(dir, "proto");
  const output = path.join(dir, "generated");
  await mkdir(input, { recursive: true });
  await writeFile(path.join(input, "test.thrift"), "service TestService { void safe() }");

  await generate({ input, output });

  const serviceContent = await readFile(path.join(output, "test/services/TestService.ts"), "utf8");
  expect(serviceContent).toContain('"safe"(options?: ThriftRequestOptions): Promise<void>;');
});

test("supports lowerCaseMethods: true in code generator and cli", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tsthrift-lowercase-methods-"));
  directories.push(dir);
  const input = path.join(dir, "proto");
  const output = path.join(dir, "generated");
  await mkdir(input, { recursive: true });
  await writeFile(
    path.join(input, "test.thrift"),
    "service PaymentProcessing { string GetPayment(1: string id) }",
  );

  const result = await generate({ input, output, lowerCaseMethods: true });
  expect(result.lowerCaseMethods).toBe(true);

  const serviceContent = await readFile(
    path.join(output, "test/services/PaymentProcessing.ts"),
    "utf8",
  );
  expect(serviceContent).toContain(
    '"getPayment"(id: string, options?: ThriftRequestOptions): Promise<string>;',
  );
  expect(serviceContent).toContain("lowerCaseMethods: true,");

  // CLI execution test
  const cliOutput = path.join(dir, "cli-generated");
  const cliBin = path.resolve(import.meta.dirname, "../dist/cli.mjs");
  await execute(process.execPath, [
    cliBin,
    "--input",
    input,
    "--output",
    cliOutput,
    "--lower-case-methods",
  ]);

  const cliServiceContent = await readFile(
    path.join(cliOutput, "test/services/PaymentProcessing.ts"),
    "utf8",
  );
  expect(cliServiceContent).toContain(
    '"getPayment"(id: string, options?: ThriftRequestOptions): Promise<string>;',
  );
  expect(cliServiceContent).toContain("lowerCaseMethods: true,");
});

test("scenario 1: methods differing only by initial case collide under lowerCaseMethods (API & CLI)", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tsthrift-lowercase-collision-"));
  directories.push(dir);
  const input = path.join(dir, "proto");
  const outputLowerCase = path.join(dir, "generated-lowercase");
  await mkdir(input, { recursive: true });
  await writeFile(
    path.join(input, "test.thrift"),
    "service TestService { void GetPayment(), void getPayment() }",
  );

  // 1. Programmatic generate() with lowerCaseMethods: true rejects collision
  await expect(
    generate({ input, output: outputLowerCase, lowerCaseMethods: true }),
  ).rejects.toThrow('Service method name collision in test.TestService: "getPayment"');

  // 2. CLI command with --lower-case-methods also exits with error
  const cliBin = path.resolve(import.meta.dirname, "../dist/cli.mjs");
  await expect(
    execute(process.execPath, [
      cliBin,
      "--input",
      input,
      "--output",
      path.join(dir, "cli-out"),
      "--lower-case-methods",
    ]),
  ).rejects.toThrow('Service method name collision in test.TestService: "getPayment"');
});

test("allows Thrift struct named Metadata and RequestOptions without collision", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tsthrift-business-names-"));
  directories.push(dir);
  const input = path.join(dir, "proto");
  const output = path.join(dir, "generated");
  await mkdir(input, { recursive: true });
  await writeFile(
    path.join(input, "business.thrift"),
    `
    struct Metadata { 1: string key }
    struct RequestOptions { 1: string token }
    service BusinessService { Metadata getMeta(1: RequestOptions opts) }
    `,
  );

  const result = await generate({ input, output });
  expect(result.modules).toEqual(["business"]);

  const modelsContent = await readFile(path.join(output, "business/models.ts"), "utf8");
  expect(modelsContent).toContain("export interface Metadata {");
  expect(modelsContent).toContain("export interface RequestOptions {");

  const serviceContent = await readFile(
    path.join(output, "business/services/BusinessService.ts"),
    "utf8",
  );
  expect(serviceContent).toContain("export interface BusinessServiceErrors {");
  expect(serviceContent).toContain('"getMeta": BusinessServiceGetMetaError;');
});

test("refuses unowned bundles and handwritten additions without replacing sources", async () => {
  const options = await setup();
  const dist = path.join(options.output, "../dist");
  await generate(options);
  const before = await readFile(path.join(options.output, "index.ts"), "utf8");
  await mkdir(dist);
  await writeFile(path.join(dist, "keep.txt"), "keep");
  await expect(generate({ ...options, bundle: true, dist })).rejects.toThrow("unowned");
  expect(await readFile(path.join(dist, "keep.txt"), "utf8")).toBe("keep");
  expect(await readFile(path.join(options.output, "index.ts"), "utf8")).toBe(before);

  const ownedDist = path.join(options.output, "../owned-dist");
  await generate({ ...options, bundle: true, dist: ownedDist });
  await writeFile(path.join(ownedDist, "keep.txt"), "keep");
  await expect(generate({ ...options, bundle: true, dist: ownedDist })).rejects.toThrow(
    "not owned",
  );
  expect(await readFile(path.join(ownedDist, "keep.txt"), "utf8")).toBe("keep");
});
