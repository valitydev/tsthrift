import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, expect, test } from "vite-plus/test";
import { generate } from "../src/index.ts";

const execute = promisify(execFile);
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function setup() {
  const directory = await mkdtemp(path.join(tmpdir(), "tsthrift-metadata-"));
  directories.push(directory);
  await cp(path.join(import.meta.dirname, "fixtures"), directory, { recursive: true });
  return {
    input: path.join(directory, "proto"),
    includes: [path.join(directory, "dependency")],
    output: path.join(directory, "output"),
  };
}

test("preserves the legacy form metadata contract without model or Apache generation", async () => {
  const options = await setup();
  const result = await generate({ ...options, target: "metadata" });
  const actual = JSON.parse(await readFile(path.join(options.output, "metadata.json"), "utf8"));
  const baseline = JSON.parse(
    await readFile(path.join(import.meta.dirname, "fixtures/expected/metadata.json"), "utf8"),
  );
  expect(actual).toEqual(baseline);
  expect(result.compilerVersion).toBeUndefined();
  expect(result.modules.sort()).toEqual(["common", "example"]);
  expect((await readdir(options.output)).sort()).toEqual([
    ".tsthrift.json",
    "generation.json",
    "metadata.json",
  ]);
});

test("metadata generation does not depend on supported model constant expressions", async () => {
  const options = await setup();
  await writeFile(
    path.join(options.input, "constants.thrift"),
    "const string FIRST = SECOND const string SECOND = FIRST",
  );
  await generate({ ...options, target: "metadata" });
  await expect(generate(options)).rejects.toThrow("Circular constant reference");
  expect(await readdir(options.output)).not.toContain("models");
});

test("CLI metadata generation works with no compiler on PATH", async () => {
  const options = await setup();
  const result = await execute(
    process.execPath,
    [
      path.resolve(import.meta.dirname, "../src/cli.ts"),
      "--target",
      "metadata",
      "--input",
      options.input,
      "--include",
      options.includes[0]!,
      "--output",
      options.output,
    ],
    { env: { ...process.env, PATH: "" } },
  );
  expect(result.stdout).toContain("metadata: generated 2 module(s)");
});
