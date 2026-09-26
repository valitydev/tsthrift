import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const manifestName = ".tsthrift.json";

async function listFiles(directory: string, prefix = ""): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Refusing symlink in output: ${relative}`);
    if (entry.isDirectory())
      files.push(...(await listFiles(path.join(directory, entry.name), `${relative}/`)));
    else files.push(relative);
  }
  return files.sort();
}

async function inspectOutput(output: string): Promise<boolean> {
  try {
    const stat = await lstat(output);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error(`Output must be a real directory: ${output}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  const files = await listFiles(output);
  if (!files.length) return true;
  if (!files.includes(manifestName))
    throw new Error(`Refusing unmanaged output directory: ${output}`);
  const manifest = JSON.parse(await readFile(path.join(output, manifestName), "utf8")) as {
    format?: number;
    files?: unknown;
  };
  if (
    manifest.format !== 1 ||
    !Array.isArray(manifest.files) ||
    manifest.files.some((file) => typeof file !== "string")
  ) {
    throw new Error(`Invalid output manifest: ${output}`);
  }
  const owned = new Set([...manifest.files, manifestName]);
  if (files.some((file) => !owned.has(file)))
    throw new Error(`Output contains files not owned by tsthrift: ${output}`);
  return true;
}

/** Builds in a sibling directory and replaces only verified, owned output. */
export async function publishOutput(
  output: string,
  build: (staging: string) => Promise<void>,
): Promise<void> {
  await inspectOutput(output);
  await mkdir(path.dirname(output), { recursive: true });
  const staging = await mkdtemp(path.join(path.dirname(output), ".tsthrift-"));
  let backup: string | undefined;
  let preserveBackup = false;
  try {
    await build(staging);
    await writeFile(
      path.join(staging, manifestName),
      JSON.stringify({ format: 1, files: await listFiles(staging) }, null, 2) + "\n",
    );
    if (await inspectOutput(output)) {
      backup = await mkdtemp(path.join(path.dirname(output), ".tsthrift-backup-"));
      await rename(output, path.join(backup, "previous"));
      preserveBackup = true;
    }
    try {
      await rename(staging, output);
      preserveBackup = false;
    } catch (error) {
      if (backup) {
        await rename(path.join(backup, "previous"), output);
        preserveBackup = false;
      }
      throw error;
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
    if (backup && !preserveBackup) await rm(backup, { recursive: true, force: true });
  }
}
