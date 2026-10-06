import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const execute = promisify(execFile);

/** Resolves an installed ESM package export without executing its module. */
export async function resolveFromPackage(specifier: string, directory: string): Promise<string> {
  const { stdout } = await execute(process.execPath, [
    "--experimental-import-meta-resolve",
    "--input-type=module",
    "-e",
    `try {
      process.stdout.write(JSON.stringify({ url: import.meta.resolve(process.argv[1], process.argv[2]) }));
    } catch (error) {
      process.stdout.write(JSON.stringify({ code: error.code, message: error.message }));
    }`,
    specifier,
    pathToFileURL(path.join(directory, "package.json")).href,
  ]);
  const result = JSON.parse(stdout) as { url?: string; code?: string; message?: string };
  if (!result.url) throw Object.assign(new Error(result.message), { code: result.code });
  if (result.url.startsWith("file:")) await access(fileURLToPath(result.url));
  return result.url;
}

/** Imports an installed ESM package specifier as resolved from a consumer directory. */
export async function importFromPackage(
  specifier: string,
  directory: string,
): Promise<Record<string, unknown>> {
  return (await import(await resolveFromPackage(specifier, directory))) as Record<string, unknown>;
}
