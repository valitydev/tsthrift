import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface BundleOptions {
  cwd: string;
  minify?: boolean;
}

/**
 * Bundles the generated TypeScript library into dist/ using Vite+ Pack (vp pack).
 */
export async function bundleOutput(options: BundleOptions): Promise<void> {
  const args = ["pack", "index.ts", "--dts"];
  if (options.minify) {
    args.push("--minify");
  }

  try {
    await execFileAsync("vp", args, { cwd: options.cwd });
  } catch (err: any) {
    try {
      await execFileAsync("npx", ["vite-plus", ...args], { cwd: options.cwd });
    } catch {
      throw new Error(`Failed to bundle output with vp pack: ${err.message}`);
    }
  }
}
