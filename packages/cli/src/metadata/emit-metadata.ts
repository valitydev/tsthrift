import type { Schema } from "../compiler/load-schema.ts";
import type { Metadata } from "@vality/tsthrift";

/** Preserves the legacy AST, including typedefs and omitted enum values. */
export function emitMetadata(schema: Schema): string {
  const metadata: Metadata[] = schema.programs.map(({ path, name, ast }) => ({ path, name, ast }));
  return JSON.stringify(metadata, null, 2) + "\n";
}
