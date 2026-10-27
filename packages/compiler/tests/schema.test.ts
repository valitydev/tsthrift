import { expect, test } from "vite-plus/test";
import { emitModels } from "../src/emit-models.ts";
import { parseThrift } from "../src/parse.ts";
import type { Program, Schema } from "../src/schema.ts";
import { validateSchema } from "../src/validate-schema.ts";

/** Builds a single-module schema from IDL text without touching the file system. */
function schemaOf(text: string): Schema {
  const program: Program = {
    filename: "test.thrift",
    name: "test",
    path: "test.thrift",
    ast: parseThrift(text),
    includes: new Map(),
  };
  return { roots: [program], programs: [program], localPrograms: [program], externalPrograms: [] };
}

test.each([
  ["const i64 LIMIT = 9223372036854775807", /Unsafe numeric literal/],
  ['struct Data { 1: i32 a = "invalid" }', /Invalid i32 constant/],
  ["service Example { oneway i32 ping() }", /Invalid oneway/],
  ["struct Data { -1: i32 a i32 b -2: i32 c }", /Duplicate field ID/],
  ["service Example { void then() }", /Reserved service method/],
  ["typedef Missing ID", /Unresolved type Missing/],
  ["struct X { 1: UnknownType id }", /Unresolved type UnknownType/],
  ["typedef B A typedef A B", /Circular typedef/],
  ["struct X { 1: i64 a 1: i64 b }", /Duplicate field ID/],
  ["enum X { A = 2147483647 B }", /outside i32 range/],
  ["service A extends B {} service B extends A {}", /Circular service inheritance/],
])("rejects unsupported or unresolved schema: %s", (text, error) => {
  const schema = schemaOf(text);
  expect(() => validateSchema(schema)).toThrow(error);
});

test("supports native uuid field in schema and emits string type", () => {
  const schema = schemaOf("struct Record { 1: uuid id }");
  validateSchema(schema);
  const models = emitModels(schema.roots[0]!);
  expect(models).toContain('"id": string;');
});

test("marks default-requiredness fields with @remarks requiredness", () => {
  const schema = schemaOf(
    "struct S { 1: string plain 2: optional string maybe 3: required string must }\nunion U { 1: string a }",
  );
  validateSchema(schema);
  const models = emitModels(schema.roots[0]!);
  expect(models).toContain('  /** @remarks requiredness */\n  "plain": string;');
  expect(models.match(/@remarks requiredness/g)).toHaveLength(1);
  expect(models).toContain('"maybe"?: string;');
  expect(models).toContain('"must": string;');
  expect(models).toContain('"a"?: string;');
});
