import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Schema } from "./load-schema.ts";
import type { I64Mode } from "./i64-mode.ts";

/** Rejects incompatible installed protocol packages before publishing a bundle. */
export async function validateExternalBuild(
  schema: Schema,
  directory: string,
  i64: I64Mode,
  lowerCaseMethods: boolean,
): Promise<void> {
  const execute = promisify(execFile);
  const checked = new Set<string>();
  for (const program of schema.externalPrograms) {
    const specifier = program.external!.importPath;
    if (checked.has(specifier)) continue;
    checked.add(specifier);
    const { stdout } = await execute(process.execPath, [
      "--experimental-import-meta-resolve",
      "--input-type=module",
      "-e",
      "process.stdout.write(import.meta.resolve(process.argv[1], process.argv[2]))",
      specifier,
      pathToFileURL(path.join(directory, "package.json")).href,
    ]);
    const module = await import(stdout);
    const build = module.TSTHRIFT_BUILD;
    if (
      !build ||
      build.metadataVersion !== 1 ||
      build.i64 !== i64 ||
      build.lowerCaseMethods !== lowerCaseMethods
    ) {
      throw new TypeError(
        `Incompatible or missing TSTHRIFT_BUILD in external package ${specifier}`,
      );
    }
  }
}
