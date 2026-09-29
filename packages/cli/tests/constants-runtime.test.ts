import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
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

async function setup(text: string) {
  const directory = await mkdtemp(path.join(tmpdir(), "tsthrift-constants-"));
  directories.push(directory);
  const input = path.join(directory, "proto");
  const output = path.join(directory, "generated");
  await mkdir(input);
  await writeFile(path.join(input, "example.thrift"), text);
  return { directory, input, output };
}

test("emits executable referenced, structured, and nested collection constants", async () => {
  const options = await setup(`
    include "common.thrift"
    typedef common.Settings Config
    const Config COPIED = common.SETTINGS
    const list<Config> ITEMS = [COPIED]
    const map<Config, list<i64>> VALUES = {COPIED: [10, 11]}
    union Choice { 1: Config config 2: string name }
    const Choice PICK = {"config": COPIED}
    const set<common.State> STATES = [common.State.READY]
    const string FORWARD = LATER
    const string LATER = "resolved"
    struct Empty { 1: string omitted }
    const Empty EMPTY = {}
  `);
  await writeFile(
    path.join(options.input, "common.thrift"),
    `
    enum State { ZERO READY = 4 }
    const string LABEL = "child"
    const i32 PORT = 8080
    struct Settings {
      1: required string name
      2: optional i32 port = PORT
      3: optional list<State> states
    }
    const Settings SETTINGS = {"name": LABEL, "states": [State.READY]}
  `,
  );
  await generate({ ...options, i64: "number" });
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
    path.join(options.output, "example/models.ts"),
    path.join(options.output, "common/models.ts"),
  ]);
  await writeFile(path.join(compiled, "package.json"), '{"type":"module"}');
  const script = `
    const values = await import(${JSON.stringify(pathToFileURL(path.join(compiled, "example/models.js")).href)});
    console.log(JSON.stringify({ ...values, VALUES: [...values.VALUES], STATES: [...values.STATES], common: undefined }));
  `;
  const executed = await execute(process.execPath, ["--input-type=module", "--eval", script]);
  const config = { name: "child", port: 8080, states: [4] };
  expect(JSON.parse(executed.stdout)).toEqual({
    COPIED: config,
    ITEMS: [config],
    VALUES: [[config, [10, 11]]],
    PICK: { config },
    STATES: [4],
    FORWARD: "resolved",
    LATER: "resolved",
    EMPTY: {},
  });
});

test.each([
  ["const string FIRST = SECOND const string SECOND = FIRST", /Circular constant reference/],
  ["const string VALUE = MISSING", /Unresolved constant reference/],
  ["const i16 VALUE = 32768", /Invalid i16 constant/],
  ['const i32 VALUE = "text"', /Invalid i32 constant/],
  ["struct Config { 1: required string name } const Config VALUE = {}", /Missing constant field/],
  ['struct Config {} const Config VALUE = {"extra": 1}', /Unknown constant field/],
  [
    'struct Config { 1: required string name } const Config VALUE = {"name":"a", "name":"b"}',
    /Duplicate constant field/,
  ],
  [
    'union Choice {1: string text 2: i64 number} const Choice VALUE = {"text":"a", "number":1}',
    /exactly one field/,
  ],
  [
    "struct Recursive { 1: optional Recursive value = {} } const Recursive VALUE = {}",
    /Circular constant default/,
  ],
])("rejects invalid constant values: %s", async (text, error) => {
  const options = await setup(text);
  await expect(generate(options)).rejects.toThrow(error);
});
