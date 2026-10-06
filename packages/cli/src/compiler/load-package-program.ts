import { validateThriftAst } from "@vality/tsthrift";
import type { Metadata } from "@vality/tsthrift";
import path from "node:path";
import type { ExternalNamespaceConfig } from "./external-namespaces.ts";
import type { Program } from "./schema.ts";
import { importFromPackage } from "./resolve-package.ts";

/** Reconstructs an external namespace's include graph from installed package metadata. */
export async function loadPackageProgram(
  name: string,
  config: ExternalNamespaceConfig,
  packageRoot: string,
): Promise<{ program: Program; moduleNames: string[] }> {
  const specifier = config.metadataPath ?? config.importPath;
  let pool: Metadata[];
  try {
    const module = await importFromPackage(specifier, packageRoot);
    const load = module.loadThriftMetadataByNamespaces ?? module.loadThriftMetadata;
    const loaded =
      typeof load === "function"
        ? await (load as (namespace: string) => Promise<Metadata[]>)(name)
        : (module.thriftMetadata ?? module.default);
    pool = Array.isArray(loaded) ? loaded : [loaded as Metadata];
  } catch (cause) {
    throw new Error(
      `Cannot load metadata for external module "${name}" from "${specifier}" (install the package that provides it): ${String(cause)}`,
      { cause },
    );
  }
  const built = new Map<string, Program>();
  const build = (metadata: Metadata): Program => {
    const existing = built.get(metadata.name);
    if (existing) return existing;
    validateThriftAst(metadata.ast);
    const program: Program = {
      filename: `package:${config.importPath}:${metadata.name}`,
      name: metadata.name,
      path: metadata.path,
      ast: metadata.ast,
      includes: new Map(),
      external: config,
      fromPackage: true,
    };
    built.set(metadata.name, program);
    for (const [alias, include] of Object.entries(metadata.ast.include ?? {})) {
      const dependency = pool.find(
        (item) =>
          item.path === include.path || item.name === path.basename(include.path, ".thrift"),
      );
      if (!dependency) {
        throw new Error(
          `Package metadata for "${metadata.name}" is missing include ${include.path}`,
        );
      }
      program.includes.set(alias, build(dependency));
    }
    return program;
  };
  const target = pool.find((item) => item.name === name);
  if (!target) throw new Error(`Package "${specifier}" does not provide metadata for "${name}"`);
  return { program: build(target), moduleNames: pool.map((item) => item.name) };
}
