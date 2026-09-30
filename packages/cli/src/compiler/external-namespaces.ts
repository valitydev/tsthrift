/** Configuration for an external Thrift namespace loaded from an npm package. */
export interface ExternalNamespaceConfig {
  /** The import specifier used in generated TypeScript modules (e.g. "@vality/base-proto/base"). */
  importPath: string;
  /** Root npm package name (inferred from importPath if omitted, e.g. "@vality/base-proto"). */
  package?: string;
  /** Optional custom import specifier for metadata, if different from importPath. */
  metadataPath?: string;
}

/** Extracts root npm package name from a module specifier. */
export function inferPackageName(specifier: string): string {
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");
    return parts.slice(0, 2).join("/");
  }
  return specifier.split("/")[0]!;
}

/** Parses CLI --external argument in the format "<namespace>=<importPath>". */
export function parseExternalArgument(arg: string): [string, ExternalNamespaceConfig] {
  const eq = arg.indexOf("=");
  if (eq <= 0 || eq === arg.length - 1) {
    throw new Error(
      `Invalid --external argument "${arg}". Expected format: "<namespace>=<importPath>"`,
    );
  }
  const namespace = arg.slice(0, eq).trim();
  const importPath = arg.slice(eq + 1).trim();
  if (!/^[A-Za-z_]\w*$/.test(namespace)) {
    throw new Error(`Invalid namespace identifier in --external argument: "${namespace}"`);
  }
  if (!importPath) {
    throw new Error(`Empty import path in --external argument for namespace "${namespace}"`);
  }
  return [namespace, { importPath, package: inferPackageName(importPath) }];
}

/** Whether a `--external` value names a whole npm package (no `<namespace>=` prefix). */
export function isExternalPackage(value: string): boolean {
  return !value.includes("=");
}

/** Validates a root npm package name given to `--external`. */
export function parseExternalPackage(value: string): string {
  const name = value.trim();
  if (!/^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i.test(name)) {
    throw new Error(
      `Invalid --external argument "${value}". Expected "<namespace>=<importPath>" or an npm package name`,
    );
  }
  return name;
}

/** Normalizes user-supplied external namespaces map into a validated Map. */
export function normalizeExternalNamespaces(
  external?: Record<string, string | ExternalNamespaceConfig> | string[],
): Map<string, ExternalNamespaceConfig> {
  const map = new Map<string, ExternalNamespaceConfig>();
  if (!external) return map;

  if (Array.isArray(external)) {
    for (const item of external.filter((value) => !isExternalPackage(value))) {
      const [name, config] = parseExternalArgument(item);
      if (map.has(name)) {
        throw new Error(`Duplicate external namespace mapping for "${name}"`);
      }
      map.set(name, config);
    }
    return map;
  }

  for (const [name, value] of Object.entries(external)) {
    if (!/^[A-Za-z_]\w*$/.test(name)) {
      throw new Error(`Invalid namespace identifier in external configuration: "${name}"`);
    }
    const [, config] = parseExternalArgument(
      `${name}=${typeof value === "string" ? value : value.importPath}`,
    );
    if (typeof value !== "string") {
      if (value.package !== undefined && !value.package.trim()) {
        throw new Error(`Empty package in external configuration for "${name}"`);
      }
      if (value.metadataPath !== undefined && !value.metadataPath.trim()) {
        throw new Error(`Empty metadata path in external configuration for "${name}"`);
      }
      config.package = value.package?.trim() ?? config.package;
      config.metadataPath = value.metadataPath?.trim();
    }
    map.set(name, config);
  }
  return map;
}
