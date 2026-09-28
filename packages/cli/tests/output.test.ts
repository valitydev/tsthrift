import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vite-plus/test";
import { publishOutput } from "../src/compiler/publish-output.ts";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
async function output() {
  const directory = await mkdtemp(path.join(tmpdir(), "tsthrift-output-"));
  directories.push(directory);
  return path.join(directory, "generated");
}

test("failed regeneration leaves the previous output intact", async () => {
  const directory = await output();
  await publishOutput(directory, (stage) => writeFile(path.join(stage, "old.ts"), "old"));
  await expect(
    publishOutput(directory, async (stage) => {
      await writeFile(path.join(stage, "new.ts"), "new");
      throw new Error("compiler failed");
    }),
  ).rejects.toThrow("compiler failed");
  expect(await readFile(path.join(directory, "old.ts"), "utf8")).toBe("old");
  expect(await readdir(path.dirname(directory))).toEqual(["generated"]);
});

test("successful regeneration removes stale owned output", async () => {
  const directory = await output();
  await publishOutput(directory, (stage) => writeFile(path.join(stage, "old.ts"), "old"));
  await publishOutput(directory, (stage) => writeFile(path.join(stage, "new.ts"), "new"));
  expect((await readdir(directory)).sort()).toEqual(["new.ts"]);
});

test("refuses non-directory output paths", async () => {
  const directory = await output();
  await writeFile(directory, "not a directory");
  await expect(publishOutput(directory, async () => {})).rejects.toThrow("real directory");
});
