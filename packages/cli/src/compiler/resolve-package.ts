import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { pathToFileURL } from "node:url";

const execute = promisify(execFile);

/** Imports an installed ESM package specifier as resolved from a consumer directory. */
export async function importFromPackage(
  specifier: string,
  directory: string,
): Promise<Record<string, unknown>> {
  const { stdout } = await execute(process.execPath, [
    "--experimental-import-meta-resolve",
    "--input-type=module",
    "-e",
    "process.stdout.write(import.meta.resolve(process.argv[1], process.argv[2]))",
    specifier,
    pathToFileURL(path.join(directory, "package.json")).href,
  ]);
  return (await import(stdout)) as Record<string, unknown>;
}
