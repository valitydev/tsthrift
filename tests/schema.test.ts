import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vite-plus/test";
import { loadSchema } from "../src/compiler/load-schema.ts";
import { validateSchema } from "../src/compiler/validate-schema.ts";
import { emitModels } from "../src/compiler/emit-models.ts";
import { validateApache } from "../src/compiler/validate-apache.ts";

const fixtures = path.join(import.meta.dirname, "fixtures");
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function source(text: string) {
  const directory = await mkdtemp(path.join(tmpdir(), "tsthrift-schema-"));
  directories.push(directory);
  await writeFile(path.join(directory, "test.thrift"), text);
  return loadSchema(directory, [], ["test"]);
}

test("loads only selected inputs and reachable includes, preserving legacy metadata", async () => {
  const schema = await loadSchema(
    path.join(fixtures, "proto"),
    [path.join(fixtures, "dependency")],
    ["example"],
  );
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
  expect(models).toContain('import * as common from "./common.js"');
  expect(models).toContain("globalThis.Map<string, Identifier[]>");
  expect(models).toContain('"labels"?: globalThis.Map<number, string>');
  expect(models).toContain("extends common.BaseClient");
  expect(models).toContain('"next"(id: number): Promise<number>');
  expect(models).toContain('"CLOSED" = 5');
  expect(models).toContain('new globalThis.Map([["first", 1]])');
});

test.each([
  ["const i64 LIMIT = 9223372036854775807", /Unsafe numeric literal/],
  ["typedef Missing ID", /Unresolved type Missing/],
  ["typedef B A typedef A B", /Circular typedef/],
  ["struct X { 1: i64 a 1: i64 b }", /Duplicate field ID/],
  ["enum X { A = 2147483647 B }", /outside i32 range/],
  ["service A extends B {} service B extends A {}", /Circular service inheritance/],
])("rejects unsupported or unresolved schema: %s", async (text, error) => {
  const schema = await source(text);
  expect(() => validateSchema(schema)).toThrow(error);
});

test.each([
  ["struct Key { 1: string value } struct X { 1: map<Key, string> values }", /Unsupported map key/],
  ["service X { void call(1: i64 callback) }", /callback argument/],
])("keeps Apache restrictions out of metadata and models: %s", async (text, error) => {
  const schema = await source(text);
  expect(() => validateSchema(schema)).not.toThrow();
  expect(() => emitModels(schema.roots[0]!)).not.toThrow();
  expect(() => validateApache(schema)).toThrow(error);
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
