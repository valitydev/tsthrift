import type { ExternalNamespaceConfig } from "./external-namespaces.ts";
import { resolveFromPackage } from "./resolve-package.ts";

/** Prefers a metadata-only export while retaining legacy namespace entrypoints. */
export async function resolveExternalMetadata(
  config: ExternalNamespaceConfig,
  directory: string,
): Promise<ExternalNamespaceConfig> {
  if (config.metadataPath) return config;
  const metadataPath = `${config.importPath}/metadata`;
  try {
    await resolveFromPackage(metadataPath, directory);
    return { ...config, metadataPath };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (
      code !== "ERR_PACKAGE_PATH_NOT_EXPORTED" &&
      code !== "ERR_MODULE_NOT_FOUND" &&
      code !== "MODULE_NOT_FOUND" &&
      code !== "ENOENT"
    ) {
      throw error;
    }
    return config;
  }
}
