import type { Schema } from "../schema.ts";
import type { Metadata } from "@vality/tsthrift";

/** Preserves the legacy AST, including typedefs and omitted enum values. */
export function schemaMetadata(schema: Schema, build?: Metadata["build"]): Metadata[] {
  return schema.programs.map(({ path, name, ast }) => ({
    metadataVersion: 1,
    ...(build ? { build } : {}),
    path,
    name,
    ast,
  }));
}

export function emitMetadata(schema: Schema, build?: Metadata["build"]): string {
  return JSON.stringify(schemaMetadata(schema, build), null, 2) + "\n";
}
