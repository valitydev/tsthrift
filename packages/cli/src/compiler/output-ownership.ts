import { lstat, realpath, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const MANIFEST = ".tsthrift.json";

async function files(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Output contains a symbolic link: ${entry.name}`);
    if (entry.isDirectory()) {
      result.push(
        ...(await files(path.join(directory, entry.name))).map((file) => `${entry.name}/${file}`),
      );
    } else result.push(entry.name);
  }
  return result;
}

/** Refuses replacement of nonempty directories that are not exclusively generated output. */
export async function validateOwnedOutput(output: string): Promise<boolean> {
  try {
    const stat = await lstat(output);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error(`Output must be a real directory: ${output}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  const actual = await files(output);
  if (!actual.length) return true;
  let owned: unknown;
  try {
    owned = JSON.parse(await readFile(path.join(output, MANIFEST), "utf8"));
  } catch {
    throw new Error(`Refusing to replace unowned output directory: ${output}`);
  }
  if (
    !Array.isArray(owned) ||
    !owned.every((file) => typeof file === "string") ||
    actual.some((file) => file !== MANIFEST && !owned.includes(file))
  ) {
    throw new Error(`Output contains files not owned by tsthrift: ${output}`);
  }
  return true;
}

export async function writeOutputOwnership(output: string): Promise<void> {
  await writeFile(path.join(output, MANIFEST), JSON.stringify(await files(output), null, 2) + "\n");
}

/** Resolves existing ancestors so path safety also covers symlinked parents. */
export async function canonicalOutputPath(output: string): Promise<string> {
  try {
    return await realpath(output);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return path.join(await canonicalOutputPath(path.dirname(output)), path.basename(output));
  }
}
