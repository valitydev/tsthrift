import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vite-plus/test";
import { loadSchema } from "../src/compiler/load-schema.ts";
import { validateSchema } from "../src/compiler/validate-schema.ts";
import { emitModels } from "../src/compiler/emit-models.ts";
import { emitProgramServices } from "../src/compiler/emit-services.ts";

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
  validateSchema(schema);
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
  const models = emitModels(program);
  expect(models).toContain('import * as common from "../common/models.js"');
  expect(models).toContain("globalThis.Map<string, Identifier[]>");
  expect(models).toContain('"CLOSED" = 5');
  expect(models).toContain('new globalThis.Map([["first", 1]])');
  const services = emitProgramServices(program);
  expect(services[0]!.content).toContain("extends common_Base");
  expect(services[0]!.content).toContain(
    '"next"(id: bigint, options?: models.RequestOptions): Promise<bigint>',
  );
});

test.each([
  ["const i64 LIMIT = 9223372036854775807", /Unsafe numeric literal/],
  ['struct Data { 1: i32 a = "invalid" }', /Invalid i32 constant/],
  ["service Example { oneway i32 ping() }", /Invalid oneway/],
  ["struct Data { -1: i32 a i32 b -2: i32 c }", /Duplicate field ID/],
  ["service Example { void then() }", /Reserved service method/],
  ["service Example { void safe() }", /Reserved service method/],
  ["typedef Missing ID", /Unresolved type Missing/],
  ["struct X { 1: uuid id }", /Unresolved type uuid/],
  ["typedef B A typedef A B", /Circular typedef/],
  ["struct X { 1: i64 a 1: i64 b }", /Duplicate field ID/],
  ["enum X { A = 2147483647 B }", /outside i32 range/],
  ["service A extends B {} service B extends A {}", /Circular service inheritance/],
])("rejects unsupported or unresolved schema: %s", async (text, error) => {
  const schema = await source(text);
  expect(() => validateSchema(schema)).toThrow(error);
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
