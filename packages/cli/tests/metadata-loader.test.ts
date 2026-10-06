import { cp, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, test } from "vite-plus/test";
import { generate } from "../src/index.ts";
import { getTransitiveDependencies } from "../src/metadata/dependencies.ts";
import type { Program } from "../src/compiler/schema.ts";
import type { Metadata } from "@vality/tsthrift";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function setup() {
  const directory = await mkdtemp(path.join(tmpdir(), "tsthrift-loader-"));
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

test("getTransitiveDependencies collects full transitive graph with root first", () => {
  const programC: Program = {
    name: "c",
    path: "c.thrift",
    filename: "/c.thrift",
    ast: {},
    includes: new Map(),
  };
  const programB: Program = {
    name: "b",
    path: "b.thrift",
    filename: "/b.thrift",
    ast: {},
    includes: new Map([["c", programC]]),
  };
  const programA: Program = {
    name: "a",
    path: "a.thrift",
    filename: "/a.thrift",
    ast: {},
    includes: new Map([
      ["b", programB],
      ["c", programC],
    ]),
  };

  const depsA = getTransitiveDependencies(programA);
  expect(depsA.map((p) => p.name)).toEqual(["a", "b", "c"]);

  const depsB = getTransitiveDependencies(programB);
  expect(depsB.map((p) => p.name)).toEqual(["b", "c"]);

  const depsC = getTransitiveDependencies(programC);
  expect(depsC.map((p) => p.name)).toEqual(["c"]);
});

test("loadThriftMetadataByNamespaces loads only reachable dependencies and memoizes result", async () => {
  const options = await setup();
  await generate(options);

  const metadataIndexPath = path.join(options.output, "metadata.ts");
  const { loadThriftMetadataByNamespaces } = await import(pathToFileURL(metadataIndexPath).href);

  // example depends on common
  const exampleMetadata: Metadata[] = await loadThriftMetadataByNamespaces("example");
  expect(exampleMetadata).toHaveLength(2);
  expect(exampleMetadata.map((m) => m.name)).toEqual(["example", "common"]);

  // common has no dependencies
  const commonMetadata: Metadata[] = await loadThriftMetadataByNamespaces("common");
  expect(commonMetadata).toHaveLength(1);
  expect(commonMetadata[0]?.name).toBe("common");

  const selectedMetadata: Metadata[] = await loadThriftMetadataByNamespaces([
    "example",
    "common",
    "example",
  ]);
  expect(selectedMetadata.map((m) => m.name)).toEqual(["example", "common"]);
  const { THRIFT_NAMESPACES } = await import(pathToFileURL(metadataIndexPath).href);
  expect(
    (await loadThriftMetadataByNamespaces(THRIFT_NAMESPACES)).map((m: Metadata) => m.name),
  ).toEqual(["common", "example"]);
  expect(await loadThriftMetadataByNamespaces([])).toEqual([]);

  // Namespace local loader works standalone
  const exampleLoaderPath = path.join(options.output, "example/load-metadata.ts");
  const { loadThriftMetadata: loadLocalExample } = await import(
    pathToFileURL(exampleLoaderPath).href
  );
  const localExampleMetadata: Metadata[] = await loadLocalExample();
  expect(localExampleMetadata.map((m) => m.name)).toEqual(["example", "common"]);

  // Memoization: same promise returned for subsequent calls
  const cachedPromise = loadThriftMetadataByNamespaces("example");
  const anotherPromise = loadThriftMetadataByNamespaces("example");
  expect(cachedPromise).toBe(anotherPromise);

  // Unknown namespace throws descriptive error
  await expect(loadThriftMetadataByNamespaces("nonexistent")).rejects.toThrow(
    "Unknown metadata namespace: nonexistent",
  );
});
