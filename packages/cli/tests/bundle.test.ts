import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, test } from "vite-plus/test";
import { generate } from "../src/index.ts";

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
  const directory = await mkdtemp(path.join(tmpdir(), "tsthrift-bundle-"));
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
    dist: path.join(directory, "dist"),
    bundle: true,
  };
}

test.each(["number", "bigint"] as const)(
  "preserves namespace model and service paths with executable strict declarations (%s)",
  async (i64) => {
    const options = await setup();
    await generate({ ...options, i64 });
    const sources = (await readdir(options.output, { recursive: true })).filter((file) =>
      file.endsWith(".ts"),
    );
    const files = await readdir(options.dist, { recursive: true });
    for (const source of sources) {
      expect(files).toContain(source.replace(/\.ts$/, ".mjs"));
      expect(files).toContain(source.replace(/\.ts$/, ".d.mts"));
    }
    const modules = sources.map((source) => source.replace(/\.ts$/, ".mjs"));
    expect(files.filter((file) => file.endsWith(".mjs") && !file.startsWith("_virtual/"))).toEqual(
      expect.arrayContaining(modules),
    );
    expect(
      files.filter((file) => file.endsWith(".mjs") && !file.startsWith("_virtual/")),
    ).toHaveLength(modules.length);
    expect(await readFile(path.join(options.dist, "example/models.d.mts"), "utf8")).toContain(
      "export interface Request",
    );
    expect(
      await readFile(path.join(options.dist, "example/services/Example.d.mts"), "utf8"),
    ).toContain("createExample");

    const consumer = path.join(options.dist, "../consumer.mts");
    await writeFile(
      consumer,
      `import { createExample, Status, type Request } from "./dist/example/index.mjs";
import type { Identifier } from "./dist/common/index.mjs";
import { loadThriftMetadata as loadExampleMetadata } from "./dist/example/index.mjs";
import { THRIFT_NAMESPACES, THRIFT_SERVICES, loadThriftMetadataByNamespaces } from "./dist/index.mjs";
const namespaces: readonly ["common", "example"] = THRIFT_NAMESPACES;
const selected = loadThriftMetadataByNamespaces(["example", "common"] as const);
const all = loadThriftMetadataByNamespaces(THRIFT_NAMESPACES);
const single = loadThriftMetadataByNamespaces("example");
// @ts-expect-error The root selector accepts only generated namespace names.
loadThriftMetadataByNamespaces("missing");
// @ts-expect-error Every array element must be a generated namespace name.
loadThriftMetadataByNamespaces(["example", "missing"]);
const arbitraryNames: readonly string[] = ["example"];
// @ts-expect-error A broad string array does not guarantee known namespace names.
loadThriftMetadataByNamespaces(arbitraryNames);
const local = loadExampleMetadata();
// @ts-expect-error Namespace-local loaders do not accept a namespace selection.
loadExampleMetadata(["example"]);
// @ts-expect-error A root loader requires an explicit namespace selection.
loadThriftMetadataByNamespaces();
// @ts-expect-error Namespace names are readonly.
THRIFT_NAMESPACES.push("example");
// @ts-expect-error The namespace union excludes unknown module names.
const unknownNamespace: typeof THRIFT_NAMESPACES[number] = "missing";
const id: Identifier = ${i64 === "number" ? "42" : "42n"};
const request: Request = { id };
const client = createExample({ endpoint: "unused" });
const result: Promise<${i64}> = client.next(id);
const echoed: Promise<Request> = THRIFT_SERVICES["example.Example"].createService({ endpoint: "unused" }).echo(request);
void [result, echoed, Status.ACTIVE, loadThriftMetadataByNamespaces, namespaces, unknownNamespace, selected, all, single, local];
`,
    );
    await execute(process.execPath, [
      tsc,
      "--ignoreConfig",
      "--noEmit",
      "--strict",
      "--module",
      "NodeNext",
      "--target",
      "ES2022",
      consumer,
    ]);
    await execute(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import assert from "node:assert/strict";
import { createExample, Status } from "./dist/example/index.mjs";
import { THRIFT_NAMESPACES, THRIFT_SERVICES, loadThriftMetadataByNamespaces } from "./dist/index.mjs";
import { BinaryReader, BinaryWriter, MessageType } from "@vality/tsthrift";
assert.equal(Status.ACTIVE, 4);
assert.deepEqual(THRIFT_NAMESPACES, ["common", "example"]);
assert.deepEqual((await loadThriftMetadataByNamespaces(["example", "common", "example"])).map(m => m.name), ["example", "common"]);
assert.deepEqual((await loadThriftMetadataByNamespaces(THRIFT_NAMESPACES)).map(m => m.name), ["common", "example"]);
await assert.rejects(loadThriftMetadataByNamespaces(), /Expected a namespace string or an array/);
for (const namespace of THRIFT_NAMESPACES) {
  assert.ok((await loadThriftMetadataByNamespaces(namespace)).some(m => m.name === namespace));
}
assert.deepEqual((await loadThriftMetadataByNamespaces("example")).map(m => m.name).sort(), ["common", "example"]);
const transport = async bytes => {
  const reader = new BinaryReader(bytes);
  const header = reader.readMessageBegin();
  reader.readFieldBegin();
  assert.equal(reader.readI64(), 42n);
  const writer = new BinaryWriter();
  writer.writeMessageBegin(header.name, MessageType.Reply, header.sequenceId);
  writer.writeFieldBegin(10, 0); writer.writeI64(42n); writer.writeFieldStop();
  return writer.finish();
};
for (const factory of [createExample, THRIFT_SERVICES["example.Example"].createService]) {
  assert.equal(await factory({ endpoint: "unused", transport }).next(${i64 === "number" ? "42" : "42n"}), ${i64 === "number" ? "42" : "42n"});
}
`,
      ],
      { cwd: path.dirname(options.output) },
    );
  },
);

test("keeps metadata imports lazy and namespace-local in unminified distribution modules", async () => {
  const options = await setup();
  await generate(options);
  const metadata = await readFile(path.join(options.dist, "metadata.mjs"), "utf8");
  expect(metadata).toContain('import("./example/load-metadata.mjs")');
  expect(metadata).not.toContain('"metadataVersion"');
  const loader = await readFile(path.join(options.dist, "example/load-metadata.mjs"), "utf8");
  expect(loader).toContain('import("./metadata.mjs")');
  expect(loader).toContain('import("../common/metadata.mjs")');
  expect(loader).not.toContain('"metadataVersion"');
  expect(await readFile(path.join(options.dist, "example/metadata.mjs"), "utf8")).toContain(
    '"metadataVersion"',
  );
  expect(metadata.trim().split("\n").length).toBeGreaterThan(5);
  await rm(path.join(options.dist, "example/metadata.mjs"));
  await rm(path.join(options.dist, "common/metadata.mjs"));
  await execute(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import assert from "node:assert/strict";
import { THRIFT_NAMESPACES, loadThriftMetadataByNamespaces } from "./dist/index.mjs";
assert.deepEqual(THRIFT_NAMESPACES, ["common", "example"]);
await assert.rejects(loadThriftMetadataByNamespaces("example"), /Cannot find module/);
`,
    ],
    { cwd: path.dirname(options.output) },
  );
});
