import type { Metadata } from "@vality/tsthrift";
import { programsFromMetadata } from "@vality/tsthrift-compiler";
import type { ExternalNamespaceConfig, Program } from "@vality/tsthrift-compiler";
import { importFromPackage } from "./resolve-package.ts";
import { resolveExternalMetadata } from "./resolve-external-metadata.ts";

/** Reconstructs an external namespace's include graph from installed package metadata. */
export async function loadPackageProgram(
  name: string,
  config: ExternalNamespaceConfig,
  packageRoot: string,
): Promise<{ program: Program; moduleNames: string[] }> {
  config = await resolveExternalMetadata(config, packageRoot);
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
  return programsFromMetadata(name, pool, config, specifier);
}
