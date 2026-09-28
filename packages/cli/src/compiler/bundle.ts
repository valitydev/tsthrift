import { execFile } from "node:child_process";
import { stat, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface BundleOptions {
  entry: string;
  outDir: string;
  tsconfig?: string;
  cwd?: string;
}

async function hasPackageJson(startDir: string): Promise<boolean> {
  let current = path.resolve(startDir);
  while (true) {
    try {
      await stat(path.join(current, "package.json"));
      return true;
    } catch {
      // continue searching upwards
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return false;
}

/**
 * Bundles the generated TypeScript library using Vite+ Pack (vp pack).
 */
export async function bundleOutput(options: BundleOptions): Promise<void> {
  const args = ["pack", options.entry, "--dts", "--minify", "--out-dir", options.outDir];
  if (options.tsconfig) {
    args.push("--tsconfig", options.tsconfig);
  }

  const cwd = options.cwd ?? path.dirname(options.entry);
  const hasPkg = await hasPackageJson(cwd);
  const tempPkg = path.join(cwd, "package.json");
  let createdTempPkg = false;

  if (!hasPkg) {
    await writeFile(tempPkg, JSON.stringify({ type: "module" }, null, 2) + "\n");
    createdTempPkg = true;
  }

  try {
    await execFileAsync("vp", args, { cwd });
  } catch (err: any) {
    try {
      await execFileAsync("npx", ["vite-plus", ...args], { cwd });
    } catch {
      throw new Error(`Failed to bundle output with vp pack: ${err.message}`);
    }
  } finally {
    if (createdTempPkg) {
      await rm(tempPkg, { force: true });
    }
  }
}
