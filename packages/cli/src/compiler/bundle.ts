import path from "node:path";

export interface BundleOptions {
  entry: string | string[];
  outDir: string;
  tsconfig?: string;
  cwd?: string;
}

/** Bundles only generated entries without loading or modifying the consumer's build config. */
export async function bundleOutput(options: BundleOptions): Promise<void> {
  let pack: typeof import("vite-plus/pack");
  try {
    pack = await import("vite-plus/pack");
  } catch (cause) {
    throw new Error(
      "--bundle requires vite-plus and typescript installed in the protocol package",
      { cause },
    );
  }
  const entries = Array.isArray(options.entry) ? options.entry : [options.entry];
  const root = path.dirname(entries[0]!);
  await pack.build({
    config: false,
    exports: false,
    entry: Object.fromEntries(
      entries.map((entry) => [
        path.relative(root, entry).replace(/\.ts$/, "").split(path.sep).join("/"),
        entry,
      ]),
    ),
    outDir: options.outDir,
    cwd: options.cwd ?? root,
    tsconfig: options.tsconfig,
    dts: true,
    minify: true,
    format: "esm",
    platform: "neutral",
    external: ["@vality/tsthrift"],
    outExtensions: () => ({ js: ".mjs", dts: ".d.mts" }),
  });
}
