export { generate } from "./compiler/generate.ts";
export {
  emitProgramClients,
  emitProgramIndex,
  emitServicesRegistry,
  emitClientsRootIndex,
} from "./compiler/emit-clients.ts";
export type { EmittedClientFile } from "./compiler/emit-clients.ts";
export type { GenerateOptions, GenerateResult, GenerateTarget } from "./compiler/generate.ts";
export type { I64Mode } from "./compiler/i64-mode.ts";
export type { Metadata, ThriftAst, ValueType } from "@vality/tsthrift";
