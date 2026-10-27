export { parseThrift } from "./parse.ts";
export {
  emitProject,
  projectEntries,
  resolveProjectOptions,
  validateProject,
} from "./emit-project.ts";
export type { GeneratedFile, ProjectOptions, ResolvedProjectOptions } from "./emit-project.ts";
export { getTransitiveDependencies } from "./metadata/dependencies.ts";
export type { Program, Schema } from "./schema.ts";
export { parseBinaryMode } from "./binary-mode.ts";
export type { BinaryMode } from "./binary-mode.ts";
export { parseI64Mode } from "./i64-mode.ts";
export type { I64Mode } from "./i64-mode.ts";
export {
  inferPackageName,
  isExternalPackage,
  normalizeExternalNamespaces,
  parseExternalArgument,
  parseExternalPackage,
} from "./external-namespaces.ts";
export type { ExternalNamespaceConfig } from "./external-namespaces.ts";
