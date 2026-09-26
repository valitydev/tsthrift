import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { Schema } from "./load-schema.ts";

const execute = promisify(execFile);
export const apacheGenerator = "js:node,es6,bigint";

async function run(compiler: string, args: string[]): Promise<string> {
  try {
    const result = await execute(compiler, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    return result.stdout + result.stderr;
  } catch (cause) {
    const failure = cause as Error & { stdout?: string; stderr?: string };
    throw new Error(
      `Thrift compiler failed (${compiler}): ${failure.stderr || failure.stdout || failure.message}`,
      { cause },
    );
  }
}

export async function compilerVersion(compiler: string): Promise<string> {
  const version = (await run(compiler, ["-version"])).trim();
  if (version !== "Thrift version 0.24.0") {
    throw new Error(
      `Expected Apache Thrift 0.24.0, got ${version}. Select the compiler with --compiler.`,
    );
  }
  return version;
}

export async function generateJavaScript(
  compiler: string,
  schema: Schema,
  includes: string[],
  output: string,
): Promise<void> {
  for (const program of schema.programs) {
    await run(compiler, [
      ...includes.flatMap((root) => ["-I", root]),
      "--gen",
      apacheGenerator,
      "-out",
      output,
      program.filename,
    ]);
  }
  for (const filename of await readdir(output)) {
    if (!filename.endsWith(".js")) continue;
    const source = await readFile(path.join(output, filename), "utf8");
    const declared = new Set(
      [...source.matchAll(/\b(?:var|let|const)\s+(\w+_ttypes)\s*=/g)].map((match) => match[1]),
    );
    for (const match of source.matchAll(/\b(\w+_ttypes)\./g)) {
      if (!declared.has(match[1])) {
        throw new Error(
          `Unresolved generated reference ${match[1]} in ${filename}; check transitive typedef includes`,
        );
      }
    }
  }
}
