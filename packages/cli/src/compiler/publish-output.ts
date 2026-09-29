import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import path from "node:path";

import {
  validateDirectory,
  validateOwnedOutput,
  writeOutputOwnership,
} from "./output-ownership.ts";

export interface PublishOutputOptions {
  ownership?: boolean;
}

/** Builds in a sibling staging directory and atomically replaces the output directory on success. */
export async function publishOutput(
  output: string,
  build: (staging: string) => Promise<void>,
  options: PublishOutputOptions = {},
): Promise<void> {
  const ownership = options.ownership ?? true;
  const exists = ownership ? await validateOwnedOutput(output) : await validateDirectory(output);
  await mkdir(path.dirname(output), { recursive: true });
  const staging = await mkdtemp(path.join(path.dirname(output), ".tsthrift-staging-"));
  let backup: string | undefined;
  let preserveBackup = false;
  try {
    await build(staging);
    if (ownership) {
      await writeOutputOwnership(staging);
    }
    if (exists) {
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
