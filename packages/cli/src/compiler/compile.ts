import path from "node:path";
import { build } from "tsdown";

export interface CompileOptions {
  /** `tsconfig.json` generated next to the TypeScript sources. */
  tsconfig: string;
  /** Package entry points: the root index, namespace indexes, and metadata loaders. */
  entries: string[];
  outDir: string;
  sourcemap?: boolean;
}

/**
 * Builds an unminified ESM package preserving source module paths and `.d.mts` declarations.
 * Dynamic `import()` stays lazy, installed packages stay external, and the consumer's build
 * configuration and manifest are never read.
 */
export async function compileOutput(options: CompileOptions): Promise<void> {
  const root = path.dirname(options.tsconfig);
  await build({
    config: false,
    exports: false,
    logLevel: "silent",
    entry: Object.fromEntries(
      options.entries.map((entry) => [
        path.relative(root, entry).replace(/\.ts$/, "").split(path.sep).join("/"),
        entry,
      ]),
    ),
    outDir: options.outDir,
    cwd: root,
    root,
    unbundle: true,
    tsconfig: options.tsconfig,
    dts: true,
    minify: false,
    sourcemap: options.sourcemap ?? false,
    format: "esm",
    platform: "neutral",
    deps: { neverBundle: [/^[^./]/] },
    outExtensions: () => ({ js: ".mjs", dts: ".d.mts" }),
  });
}
