import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vite-plus/test";
import {
  generate,
  inferPackageName,
  normalizeExternalNamespaces,
  parseExternalArgument,
} from "../src/index.ts";

const execute = promisify(execFile);
const cliBin = path.resolve(import.meta.dirname, "../dist/cli.mjs");

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createFixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "tsthrift-external-"));
  directories.push(dir);

  await symlink(
    path.resolve(import.meta.dirname, "../node_modules"),
    path.join(dir, "node_modules"),
    "dir",
  );

  const protoDir = path.join(dir, "proto");
  const depDir = path.join(dir, "dep");
  const output = path.join(dir, "generated");

  await mkdir(protoDir, { recursive: true });
  await mkdir(depDir, { recursive: true });

  await writeFile(
    path.join(depDir, "base.thrift"),
    `
    namespace java com.example.base

    struct BaseData {
      1: required string id
    }

    service BaseService {
      BaseData getBase(1: string id)
    }
    `,
  );

  await writeFile(
    path.join(protoDir, "child.thrift"),
    `
    namespace java com.example.child

    include "base.thrift"

    struct ChildData {
      1: required base.BaseData baseData
      2: optional string description
    }

    service ChildService extends base.BaseService {
      ChildData getChild(1: string id)
    }
    `,
  );

  return { dir, protoDir, depDir, output };
}

describe("external namespaces utilities", () => {
  test("inferPackageName extracts root npm package from specifiers", () => {
    expect(inferPackageName("@vality/base-proto/base")).toBe("@vality/base-proto");
    expect(inferPackageName("@vality/base-proto")).toBe("@vality/base-proto");
    expect(inferPackageName("my-proto/base/models")).toBe("my-proto");
    expect(inferPackageName("simple-proto")).toBe("simple-proto");
  });

  test("parseExternalArgument parses <namespace>=<importPath>", () => {
    const [ns, config] = parseExternalArgument("base=@vality/base-proto/base");
    expect(ns).toBe("base");
    expect(config.importPath).toBe("@vality/base-proto/base");
    expect(config.package).toBe("@vality/base-proto");
  });

  test("parseExternalArgument rejects invalid formats", () => {
    expect(() => parseExternalArgument("no-equals")).toThrow(/Invalid --external argument/);
    expect(() => parseExternalArgument("=no-ns")).toThrow(/Invalid --external argument/);
    expect(() => parseExternalArgument("no-pkg=")).toThrow(/Invalid --external argument/);
  });

  test("normalizeExternalNamespaces detects duplicate namespace mappings", () => {
    expect(() =>
      normalizeExternalNamespaces([
        "base=@vality/base-proto/base",
        "base=@vality/other-proto/base",
      ]),
    ).toThrow('Duplicate external namespace mapping for "base"');
  });
});

describe("external namespaces code generation", () => {
  test("generates models and services with external namespace imports", async () => {
    const { protoDir, depDir, output } = await createFixture();

    const result = await generate({
      input: protoDir,
      includes: [depDir],
      output,
      external: {
        base: "@vality/base-proto/base",
      },
    });

    expect(result.modules).toEqual(["child"]);
    expect(result.externalModules).toEqual(["base"]);

    const files = await readdir(output);
    expect(files).toContain("child");
    expect(files).not.toContain("base");

    // Check models.ts imports from external package
    const modelsContent = await readFile(path.join(output, "child/models.ts"), "utf8");
    expect(modelsContent).toContain('import * as base from "@vality/base-proto/base";');
    expect(modelsContent).toContain('"baseData": base.BaseData;');

    // Check service extends external service
    const serviceContent = await readFile(
      path.join(output, "child/services/ChildService.ts"),
      "utf8",
    );
    expect(serviceContent).toContain(
      'import type {\n  BaseService as base_BaseService,\n  BaseServiceErrors as base_BaseServiceErrors,\n} from "@vality/base-proto/base";',
    );
    expect(serviceContent).toContain("export interface ChildService extends base_BaseService {");
    expect(serviceContent).toContain(
      "export interface ChildServiceErrors extends base_BaseServiceErrors {",
    );

    // Check services.ts registry only registers local services
    const servicesRegistry = await readFile(path.join(output, "services.ts"), "utf8");
    expect(servicesRegistry).toContain("ChildService");
    expect(servicesRegistry).not.toContain("BaseService");

    // Check metadata loader imports external metadata
    const loadMetadata = await readFile(path.join(output, "child/load-metadata.ts"), "utf8");
    expect(loadMetadata).toContain('import("@vality/base-proto/base")');

    // Check root metadata loader contains EXTERNAL_NAMESPACES descriptor
    const rootMetadata = await readFile(path.join(output, "metadata.ts"), "utf8");
    expect(rootMetadata).toContain("export interface ExternalNamespaceDescriptor");
    expect(rootMetadata).toContain(
      "export const EXTERNAL_NAMESPACES: Record<string, ExternalNamespaceDescriptor> =",
    );
    expect(rootMetadata).toContain('name: "base"');
    expect(rootMetadata).toContain('package: "@vality/base-proto"');
    expect(rootMetadata).toContain('importPath: "@vality/base-proto/base"');
    expect(rootMetadata).toContain("isExternal: true");

    // Check root index exports EXTERNAL_NAMESPACES
    const rootIndex = await readFile(path.join(output, "index.ts"), "utf8");
    expect(rootIndex).toContain('export { EXTERNAL_NAMESPACES } from "./metadata.js";');
    expect(rootIndex).toContain(
      'export type { ExternalNamespaceDescriptor } from "./metadata.js";',
    );
  });

  test("rejects when external namespace matches a local compilation root", async () => {
    const { protoDir, depDir, output } = await createFixture();

    await expect(
      generate({
        input: [path.join(protoDir, "child.thrift"), path.join(depDir, "base.thrift")],
        output,
        external: {
          base: "@vality/base-proto/base",
        },
      }),
    ).rejects.toThrow(
      'Cannot mark module "base" as external because it is one of the local compilation roots',
    );
  });

  test("supports CLI --external argument", async () => {
    const { dir, protoDir, depDir } = await createFixture();
    const cliOutput = path.join(dir, "cli-generated");

    // Build CLI first to ensure dist/cli.mjs is fresh
    const { stdout } = await execute(process.execPath, [
      cliBin,
      "-i",
      protoDir,
      "-I",
      depDir,
      "-o",
      cliOutput,
      "-e",
      "base=@vality/base-proto/base",
    ]);

    expect(stdout).toContain("generated 1 module(s)");

    const files = await readdir(cliOutput);
    expect(files).toContain("child");
    expect(files).not.toContain("base");

    const rootMetadata = await readFile(path.join(cliOutput, "metadata.ts"), "utf8");
    expect(rootMetadata).toContain('package: "@vality/base-proto"');
  });

  test("bundles output without inlining external packages", async () => {
    const { dir, protoDir, depDir, output } = await createFixture();
    const dist = path.join(dir, "dist");

    const result = await generate({
      input: protoDir,
      includes: [depDir],
      output,
      dist,
      bundle: true,
      external: {
        base: "@vality/base-proto/base",
      },
    });

    expect(result.bundled).toBe(true);
    expect(result.dist).toBe(dist);

    const distFiles = await readdir(dist);
    expect(distFiles).toContain("index.mjs");
    expect(distFiles).toContain("child");

    // Verify external import is preserved as external dependency in the bundle chunks
    const chunkFiles = distFiles.filter((f) => f.endsWith(".mjs"));
    const allBundleContents = await Promise.all(
      chunkFiles.map((f) => readFile(path.join(dist, f), "utf8")),
    );
    expect(allBundleContents.join("\n")).toContain("@vality/base-proto/base");
  });
});

test("rejects external mappings that are not reachable from the inputs", async () => {
  const { protoDir, depDir, output } = await createFixture();
  await expect(
    generate({
      input: protoDir,
      includes: [depDir],
      output,
      external: { typo: "base-proto/base" },
    }),
  ).rejects.toThrow("not reachable");
});

test("keeps external dependencies in standalone JSON metadata", async () => {
  const { protoDir, depDir, output } = await createFixture();
  await generate({
    input: protoDir,
    includes: [depDir],
    output,
    models: false,
    external: { base: "base-proto/base" },
  });
  const metadata = JSON.parse(await readFile(path.join(output, "metadata.json"), "utf8"));
  expect(metadata.map((entry: { name: string }) => entry.name).sort()).toEqual(["base", "child"]);
});
