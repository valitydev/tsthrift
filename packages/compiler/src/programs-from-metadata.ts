import { validateThriftAst } from "@vality/tsthrift";
import type { Metadata } from "@vality/tsthrift";
import type { ExternalNamespaceConfig } from "./external-namespaces.ts";
import { moduleName } from "./posix-path.ts";
import type { Program } from "./schema.ts";

/**
 * Reconstructs the include graph of one external module from published metadata. `source`
 * names the origin in errors, for example a package specifier.
 */
export function programsFromMetadata(
  name: string,
  pool: readonly Metadata[],
  config: ExternalNamespaceConfig,
  source: string,
): { program: Program; moduleNames: string[] } {
  const built = new Map<string, Program>();
  const build = (metadata: Metadata): Program => {
    const existing = built.get(metadata.name);
    if (existing) return existing;
    if (metadata.metadataVersion !== undefined && metadata.metadataVersion !== 1)
      throw new TypeError("Unsupported metadata version");
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
        (item) => item.path === include.path || item.name === moduleName(include.path),
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
  if (!target) throw new Error(`Package "${source}" does not provide metadata for "${name}"`);
  return { program: build(target), moduleNames: pool.map((item) => item.name) };
}
