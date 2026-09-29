import type { Schema } from "../compiler/load-schema.ts";
import type { Metadata } from "@vality/tsthrift";

export interface EmitMetadataOptions {
  minify?: boolean;
}

/** Preserves the legacy AST, including typedefs and omitted enum values. */
export function emitMetadata(schema: Schema, options?: EmitMetadataOptions): string {
  const programs = schema.localPrograms ?? schema.programs;
  const metadata: Metadata[] = programs.map(({ path, name, ast }) => ({ path, name, ast }));
  return options?.minify
    ? JSON.stringify(metadata) + "\n"
    : JSON.stringify(metadata, null, 2) + "\n";
}
