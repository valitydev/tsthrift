import { expect, test } from "vite-plus/test";
import {
  emitProject,
  parseThrift,
  projectEntries,
  resolveProjectOptions,
  validateProject,
} from "../src/index.ts";
import type { Program, Schema } from "../src/index.ts";

function program(name: string, text: string, includes: Program[] = []): Program {
  return {
    filename: `${name}.thrift`,
    name,
    path: `${name}.thrift`,
    ast: parseThrift(text),
    includes: new Map(includes.map((include) => [include.name, include])),
  };
}

function schemaOf(...programs: Program[]): Schema {
  return { roots: programs, programs, localPrograms: programs, externalPrograms: [] };
}

const common = program("common", "typedef string Identifier\nexception Failure { 1: string text }");
const example = program(
  "example",
  `include "common.thrift"
   struct Request { 1: common.Identifier id, 2: optional i64 limit }
   service Example { Request get(1: common.Identifier id) throws (1: common.Failure failure) }`,
  [common],
);

function emit(options?: Parameters<typeof resolveProjectOptions>[0]) {
  const schema = schemaOf(common, example);
  const resolved = resolveProjectOptions(options);
  validateProject(schema, resolved);
  return {
    schema,
    files: new Map(emitProject(schema, resolved).map((file) => [file.path, file.content])),
  };
}

test("emits the complete generated package in memory", () => {
  const { schema, files } = emit({ i64: "number", binary: "uint8array" });
  expect([...files.keys()].sort()).toEqual([
    "build.ts",
    "common/index.ts",
    "common/load-metadata.ts",
    "common/metadata.ts",
    "common/models.ts",
    "example/index.ts",
    "example/load-metadata.ts",
    "example/metadata.ts",
    "example/models.ts",
    "example/services/Example.ts",
    "example/services/index.ts",
    "index.ts",
    "metadata.ts",
    "services.ts",
    "tsconfig.json",
  ]);
  expect(files.get("build.ts")).toContain('"i64":"number"');
  expect(files.get("build.ts")).toContain('"binary":"uint8array"');
  expect(files.get("example/models.ts")).toContain("limit");
  expect(files.get("example/services/Example.ts")).toContain("createExample");
  expect(files.get("example/load-metadata.ts")).toContain('import("../common/metadata.js")');
  for (const entry of projectEntries(schema)) expect(files.has(entry)).toBe(true);
});

test("emits only metadata.json without models", () => {
  const { files } = emit({ models: false });
  expect([...files.keys()]).toEqual(["metadata.json"]);
  const metadata = JSON.parse(files.get("metadata.json")!) as { name: string }[];
  expect(metadata.map((item) => item.name).sort()).toEqual(["common", "example"]);
});

test("omits services and the registry when services are disabled", () => {
  const { files } = emit({ services: false });
  expect([...files.keys()].some((path) => path.includes("services"))).toBe(false);
  expect(files.get("example/index.ts")).not.toContain("services");
});

test("rejects unknown numeric modes and invalid schemas before emitting", () => {
  expect(() => resolveProjectOptions({ i64: "wide" as never })).toThrow(/Invalid i64 mode/);
  expect(() => resolveProjectOptions({ binary: "hex" as never })).toThrow(/Invalid binary mode/);
  const invalid = schemaOf(program("broken", "struct X { 1: Missing id }"));
  expect(() => validateProject(invalid, resolveProjectOptions())).toThrow(/Unresolved type/);
});
