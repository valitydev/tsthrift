export { generate } from "./compiler/generate.ts";
export { emitProgramServices } from "./compiler/emit-services.ts";
export { emitProgramIndex, emitServicesRegistry } from "./compiler/emit-service-registry.ts";
export { emitModels, type BinaryTargetType } from "./compiler/emit-models.ts";
export { loadSchema, type Program, type Schema } from "./compiler/load-schema.ts";
export { parseI64Mode } from "./compiler/i64-mode.ts";
export type { EmittedServiceFile } from "./compiler/emit-services.ts";
export type { GenerateOptions, GenerateResult } from "./compiler/generate.ts";
export type { I64Mode } from "./compiler/i64-mode.ts";
export type { ExternalNamespaceConfig } from "./compiler/external-namespaces.ts";
export {
  inferPackageName,
  parseExternalArgument,
  normalizeExternalNamespaces,
} from "./compiler/external-namespaces.ts";
export type { Metadata, ThriftAst, ValueType } from "@vality/tsthrift";
