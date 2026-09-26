import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { afterEach, expect, test } from "vite-plus/test";
import { generate } from "../src/index.ts";
import type { I64Mode } from "../src/index.ts";

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
  const directory = await mkdtemp(path.join(tmpdir(), "tsthrift-i64-"));
  directories.push(directory);
  const input = path.join(directory, "proto");
  const output = path.join(directory, "generated");
  await mkdir(input);
  await writeFile(
    path.join(input, "common.thrift"),
    `
    typedef i64 Identifier
    const Identifier DEFAULT_ID = -9007199254740991
    struct Item { 1: optional Identifier id = DEFAULT_ID }
  `,
  );
  await writeFile(
    path.join(input, "example.thrift"),
    `
    include "common.thrift"
    const common.Identifier ID = common.DEFAULT_ID
    const common.Item ITEM = {}
    const map<i64, list<set<i64>>> VALUES = {ID: [[0, 42]]}
    enum Status { READY = 4 }
    const Status STATE = Status.READY
    const i32 COUNT = 42
    struct Data { 1: i64 id 2: map<i64, list<i64>> values }
    union Choice { 1: i64 id }
    exception Failure { 1: i64 id }
    service Example { i64 next(1: i64 id) }
  `,
  );
  return { directory, input, output };
}

test.each([undefined, "number", "bigint"] as const)(
  "compiles and executes public i64 values in %s mode",
  async (i64) => {
    const options = await setup();
    const mode = i64 ?? "bigint";
    const result = await generate({ ...options, i64 });
    expect(result.i64).toBe(mode);
    const manifest = JSON.parse(
      await readFile(path.join(options.output, "generation.json"), "utf8"),
    );
    expect(manifest.i64).toBe(mode);
    const models = path.join(options.output, "models");
    const source = await readFile(path.join(models, "example.ts"), "utf8");
    expect(source).toContain(`"id": ${mode};`);
    expect(source).toContain(`"id"?: ${mode};`);
    expect(source).toContain(`globalThis.Map<${mode}, ${mode}[]>`);
    expect(source).toContain(`"next"(id: ${mode}): Promise<${mode}>;`);
    expect(await readFile(path.join(models, "common.ts"), "utf8")).toContain(
      `export type Identifier = ${mode};`,
    );
    const compiled = path.join(options.directory, "compiled");
    await execute(process.execPath, [
      tsc,
      "--ignoreConfig",
      "--strict",
      "--skipLibCheck",
      "--target",
      "es2020",
      "--module",
      "es2022",
      "--outDir",
      compiled,
      path.join(models, "example.ts"),
    ]);
    await writeFile(path.join(compiled, "package.json"), '{"type":"module"}');
    const script = `
      const m = await import(${JSON.stringify(pathToFileURL(path.join(compiled, "example.js")).href)});
      const [key, [values]] = [...m.VALUES][0];
      const describe = value => [typeof value, String(value)];
      console.log(JSON.stringify({
        id: describe(m.ID), defaultId: describe(m.ITEM.id), key: describe(key),
        values: [...values].map(describe), state: describe(m.STATE), count: describe(m.COUNT)
      }));
    `;
    const { stdout } = await execute(process.execPath, ["--input-type=module", "--eval", script]);
    expect(JSON.parse(stdout)).toEqual({
      id: [mode, "-9007199254740991"],
      defaultId: [mode, "-9007199254740991"],
      key: [mode, "-9007199254740991"],
      values: [
        [mode, "0"],
        [mode, "42"],
      ],
      state: ["number", "4"],
      count: ["number", "42"],
    });
  },
);

test("CLI switches public i64 mode without changing metadata", async () => {
  const options = await setup();
  const args = [
    path.resolve(import.meta.dirname, "../src/cli.ts"),
    "--input",
    options.input,
    "--output",
    options.output,
  ];
  const env = { ...process.env, PATH: "" };
  await execute(process.execPath, args, { env });
  expect(await readFile(path.join(options.output, "models/common.ts"), "utf8")).toContain(
    "export type Identifier = bigint;",
  );
  const metadata = await readFile(path.join(options.output, "metadata.json"), "utf8");
  await execute(process.execPath, [...args, "--i64", "number"], { env });
  expect(await readFile(path.join(options.output, "models/common.ts"), "utf8")).toContain(
    "export type Identifier = number;",
  );
  expect(await readFile(path.join(options.output, "metadata.json"), "utf8")).toBe(metadata);
  await generate({ ...options, target: "metadata", i64: "bigint" });
  expect(await readFile(path.join(options.output, "metadata.json"), "utf8")).toBe(metadata);
});

test("rejects invalid i64 modes through API and CLI", async () => {
  const options = await setup();
  await expect(generate({ ...options, i64: "string" as I64Mode })).rejects.toThrow(
    "Invalid i64 mode",
  );
  await expect(
    execute(process.execPath, [
      path.resolve(import.meta.dirname, "../src/cli.ts"),
      "--input",
      options.input,
      "--output",
      options.output,
      "--i64",
      "string",
    ]),
  ).rejects.toThrow("Invalid i64 mode");
});

test.each(["number", "bigint"] as const)(
  "rejects lossy parsed literals in %s mode",
  async (i64) => {
    const options = await setup();
    await writeFile(
      path.join(options.input, "large.thrift"),
      "const i64 VALUE = 9223372036854775807",
    );
    await expect(generate({ ...options, i64 })).rejects.toThrow(/Unsafe numeric literal/);
  },
);
