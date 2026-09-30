import type { Schema } from "../compiler/load-schema.ts";
import type { Metadata } from "@vality/tsthrift";

/** Preserves the legacy AST, including typedefs and omitted enum values. */
export function emitMetadata(schema: Schema): string {
  const programs = schema.programs;
  const metadata: Metadata[] = programs.map(({ path, name, ast }) => ({
    metadataVersion: 1,
    path,
    name,
    ast,
  }));
  return JSON.stringify(metadata, null, 2) + "\n";
}
