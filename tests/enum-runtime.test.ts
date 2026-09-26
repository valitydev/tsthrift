import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "vite-plus/test";
import { generate } from "../src/index.ts";

const execute = promisify(execFile);

test("generated enums exist at runtime with numeric values and reverse mappings", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "tsthrift-enums-"));
  try {
    const input = path.join(directory, "proto");
    const output = path.join(directory, "generated");
    const compiled = path.join(directory, "compiled");
    await mkdir(input);
    await writeFile(
      path.join(input, "example.thrift"),
      `
      enum Status { NEGATIVE = -2 IMPLICIT EXPLICIT = 7 ALIAS = 7 AFTER }
      typedef list<i64> Array
      typedef map<string, Status> Map
      struct Key { 1: string value }
      struct Container { 1: map<Key, Status> values }
      service Example { Status get(1: i64 callback) }
    `,
    );
    const result = await generate({ input, output });
    expect(result.target).toBe("models");
    expect(result.compilerVersion).toBeUndefined();
    const model = path.join(output, "models/example.ts");
    expect(await readFile(model, "utf8")).toContain("export enum Status");
    await execute(path.resolve("node_modules/.bin/tsc"), [
      "--ignoreConfig",
      "--strict",
      "--skipLibCheck",
      "--target",
      "es2020",
      "--module",
      "es2022",
      "--declaration",
      "--outDir",
      compiled,
      model,
    ]);
    await writeFile(path.join(compiled, "package.json"), '{"type":"module"}');
    const script = `const { Status } = await import(${JSON.stringify(pathToFileURL(path.join(compiled, "example.js")).href)}); console.log(JSON.stringify(Status));`;
    const execution = await execute(process.execPath, ["--input-type=module", "--eval", script]);
    expect(JSON.parse(execution.stdout)).toEqual({
      NEGATIVE: -2,
      IMPLICIT: -1,
      EXPLICIT: 7,
      ALIAS: 7,
      AFTER: 8,
      "-2": "NEGATIVE",
      "-1": "IMPLICIT",
      "7": "ALIAS",
      "8": "AFTER",
    });
    expect(await readFile(path.join(compiled, "example.d.ts"), "utf8")).toContain(
      "export declare enum Status",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
