import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vite-plus/test";
import { emitProject, resolveProjectOptions, validateProject } from "@vality/tsthrift-compiler";
import { loadSchema } from "../src/load-schema.ts";

const fixtures = path.join(import.meta.dirname, "fixtures");
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function source(text: string) {
  const directory = await mkdtemp(path.join(tmpdir(), "tsthrift-schema-"));
  directories.push(directory);
  await writeFile(path.join(directory, "test.thrift"), text);
  return loadSchema(directory, []);
}

test("loads only selected inputs and reachable includes, preserving legacy metadata", async () => {
  const schema = await loadSchema(path.join(fixtures, "proto", "example.thrift"), [
    path.join(fixtures, "dependency"),
  ]);
  const options = resolveProjectOptions();
  validateProject(schema, options);
  const files = new Map(emitProject(schema, options).map((file) => [file.path, file.content]));
  expect(schema.programs.map((program) => program.name).sort()).toEqual(["common", "example"]);
  const program = schema.roots[0]!;
  expect(program.ast.include).toEqual({ common: { path: "shared/common.thrift" } });
  expect(program.ast.typedef).toEqual({
    Identifier: { type: "common.Identifier" },
    Groups: {
      type: {
        name: "map",
        keyType: "string",
        valueType: { name: "list", valueType: "Identifier" },
      },
    },
  });
  expect(program.ast.struct?.Empty).toEqual([]);
  expect(program.ast.struct?.Request?.[1]).toEqual({
    id: 2,
    name: "filter",
    type: "Empty",
    option: "optional",
  });
  expect(program.ast.service?.Example?.extends).toBe("common.Base");
  const models = files.get("example/models.ts")!;
  expect(models).toContain('import * as common from "../common/models.js"');
  expect(models).toContain("globalThis.Map<string, Identifier[]>");
  expect(models).toContain('"CLOSED" = 5');
  expect(models).toContain('new globalThis.Map([["first", 1]])');
  const service = files.get("example/services/Example.ts")!;
  expect(service).toContain("extends common_Base");
  expect(service).toContain('"next"(id: bigint, options?: ThriftRequestOptions): Promise<bigint>');
});

test("reports a missing include with its referring file", async () => {
  await expect(source('include "missing.thrift"')).rejects.toThrow(
    /Missing include missing.thrift in/,
  );
});

test("rejects duplicate module basenames instead of overwriting output", async () => {
  const schema = await source("struct X {}");
  const directory = path.dirname(schema.roots[0]!.filename);
  await mkdir(path.join(directory, "nested"));
  await writeFile(path.join(directory, "nested", "test.thrift"), "struct Y {}");
  await writeFile(path.join(directory, "test.thrift"), 'include "nested/test.thrift"');
  await expect(loadSchema(directory, [])).rejects.toThrow(/Duplicate module name test/);
});

test("shadows duplicate module when allowDuplicateModules is true (first-wins)", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "tsthrift-schema-shadow-"));
  directories.push(directory);
  await mkdir(path.join(directory, "dir_a"));
  await mkdir(path.join(directory, "dir_b"));
  await writeFile(path.join(directory, "dir_a", "shared.thrift"), "struct SharedA { 1: string a }");
  await writeFile(path.join(directory, "dir_b", "shared.thrift"), "struct SharedB { 1: string b }");
  await writeFile(
    path.join(directory, "dep1.thrift"),
    'include "dir_a/shared.thrift"\nstruct Dep1 { 1: shared.SharedA a }',
  );
  await writeFile(
    path.join(directory, "dep2.thrift"),
    'include "dir_b/shared.thrift"\nstruct Dep2 { 1: shared.SharedA b }',
  );
  await writeFile(
    path.join(directory, "entry.thrift"),
    'include "dep1.thrift"\ninclude "dep2.thrift"\nstruct Entry { 1: dep1.Dep1 d1, 2: dep2.Dep2 d2 }',
  );

  // Without flag: throws Duplicate module name
  await expect(loadSchema(path.join(directory, "entry.thrift"), [])).rejects.toThrow(
    /Duplicate module name shared/,
  );

  // With allowDuplicateModules: shadows second with first (first-wins)
  const schema = await loadSchema(path.join(directory, "entry.thrift"), [], true);
  expect(schema.programs.map((p) => p.name).sort()).toEqual(["dep1", "dep2", "entry", "shared"]);
  const sharedProgram = schema.programs.find((p) => p.name === "shared");
  expect(sharedProgram?.ast.struct?.SharedA).toBeDefined();
  expect(sharedProgram?.ast.struct?.SharedB).toBeUndefined();
});
