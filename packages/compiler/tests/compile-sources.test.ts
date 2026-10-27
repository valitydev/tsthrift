import { expect, test, vi } from "vite-plus/test";
import { createMetadataClient } from "@vality/tsthrift";
import { BinaryReader, BinaryWriter, MessageType } from "@vality/tsthrift/runtime";
import type { Metadata } from "@vality/tsthrift";
import { compileSources } from "../src/index.ts";

const sources = {
  "proto/example.thrift": `include "shared/common.thrift"
    struct Request { 1: common.Identifier id }
    service Example extends common.Base { string echo(1: string value) }`,
  "dependency/shared/common.thrift": `typedef string Identifier
    service Base { string ping() }`,
};
const options = { entries: ["proto/example.thrift"], includeRoots: ["dependency"] };

test("resolves includes next to the file and in include roots", async () => {
  const { schema, metadata } = await compileSources(sources, options);
  expect(schema.roots.map((program) => program.name)).toEqual(["example"]);
  expect(
    metadata.map(({ name, path }) => [name, path]).sort(([a], [b]) => a!.localeCompare(b!)),
  ).toEqual([
    ["common", "shared/common.thrift"],
    ["example", "example.thrift"],
  ]);
  expect(metadata.every((item) => item.metadataVersion === 1)).toBe(true);
});

test("defaults to every .thrift source as an entry", async () => {
  const { schema } = await compileSources({ "a.thrift": "struct A {}", "b.thrift": "struct B {}" });
  expect(schema.roots.map((program) => program.name)).toEqual(["a", "b"]);
});

test("compiles only the selected entries and accepts a Map", async () => {
  const files = new Map(Object.entries({ ...sources, "unrelated.thrift": "struct Other {}" }));
  const { metadata } = await compileSources(files, options);
  expect(metadata.map((item) => item.name).sort()).toEqual(["common", "example"]);
});

test("reports mistakes with the referring file", async () => {
  await expect(compileSources({ "a.thrift": 'include "missing.thrift"' })).rejects.toThrow(
    /Missing include missing.thrift in a.thrift/,
  );
  await expect(compileSources({ "a.thrift": "struct X { 1: Missing id }" })).rejects.toThrow(
    /Unresolved type Missing/,
  );
  await expect(compileSources({ "a.thrift": "struct X {" })).rejects.toThrow(
    /Cannot parse a.thrift/,
  );
  await expect(compileSources({})).rejects.toThrow(/No Thrift inputs/);
  await expect(
    compileSources({ "a.thrift": "", "b.txt": "" }, { entries: ["c.thrift"] }),
  ).rejects.toThrow(/Cannot parse c.thrift/);
});

test("rejects circular includes and duplicate module names", async () => {
  await expect(
    compileSources({ "a.thrift": 'include "b.thrift"', "b.thrift": 'include "a.thrift"' }),
  ).rejects.toThrow(/Circular include/);
  const duplicated = {
    "entry.thrift": 'include "dep1.thrift"\ninclude "dep2.thrift"',
    "dep1.thrift": 'include "x/shared.thrift"',
    "dep2.thrift": 'include "y/shared.thrift"',
    "x/shared.thrift": "struct A {}",
    "y/shared.thrift": "struct B {}",
  };
  await expect(compileSources(duplicated, { entries: ["entry.thrift"] })).rejects.toThrow(
    /Duplicate module name shared/,
  );
  const warn = vi.fn();
  const { schema } = await compileSources(duplicated, {
    entries: ["entry.thrift"],
    allowDuplicateModules: true,
    warn,
  });
  expect(schema.programs.find((program) => program.name === "shared")?.ast.struct).toHaveProperty(
    "A",
  );
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('Module "shared" in y/shared.thrift'));
});

test("includes modules from published metadata without requiring the whole pool", async () => {
  const base = await compileSources({ "base.thrift": "struct Base { 1: string id }" });
  const unused = await compileSources({ "unused.thrift": "struct Unused {}" });
  const result = await compileSources(
    { "child.thrift": 'include "base.thrift"\nstruct Child { 1: base.Base base }' },
    { external: [...base.metadata, ...unused.metadata], emit: true },
  );
  expect(result.metadata.map((item) => item.name).sort()).toEqual(["base", "child"]);
  expect(result.schema.localPrograms.map((program) => program.name)).toEqual(["child"]);
  expect(result.files.some((file) => file.path.startsWith("base/"))).toBe(false);
  expect(result.files.find((file) => file.path === "child/models.ts")?.content).toContain("base");
});

test("emits TypeScript sources only on request", async () => {
  expect((await compileSources(sources, options)).files).toEqual([]);
  const { files } = await compileSources(sources, { ...options, emit: true, i64: "number" });
  expect(files.map((file) => file.path)).toContain("example/services/Example.ts");
});

test("produces metadata that a client calls end to end", async () => {
  const { metadata, client: modes } = await compileSources(sources, { ...options, i64: "number" });
  const client = await createMetadataClient<{ echo(value: string): Promise<string> }>({
    metadata,
    namespace: "example",
    serviceName: "Example",
    endpoint: "unused",
    ...modes,
    transport: async (bytes) => {
      const reader = new BinaryReader(bytes);
      const header = reader.readMessageBegin();
      expect(header.name).toBe("echo");
      expect(reader.readFieldBegin()).toEqual({ type: 11, id: 1 });
      const writer = new BinaryWriter();
      writer.writeMessageBegin("echo", MessageType.Reply, header.sequenceId);
      writer.writeFieldBegin(11, 0);
      writer.writeString(`${reader.readString()}!`);
      writer.writeFieldStop();
      return writer.finish();
    },
  });
  expect(await client.echo("hello")).toBe("hello!");
  await expect(
    createMetadataClient({
      metadata,
      namespace: "example",
      serviceName: "Example",
      endpoint: "unused",
      i64Mode: "bigint",
    }),
  ).rejects.toThrow(TypeError);
  expect(metadata satisfies Metadata[]).toBeDefined();
});
