import type { Schema } from "../compiler/load-schema.ts";
import type { Metadata } from "@vality/tsthrift";

export interface EmitMetadataOptions {
  minify?: boolean;
}

/** Preserves the legacy AST, including typedefs and omitted enum values. */
export function emitMetadata(schema: Schema, options?: EmitMetadataOptions): string {
  const metadata: Metadata[] = schema.programs.map(({ path, name, ast }) => ({ path, name, ast }));
  return options?.minify
    ? JSON.stringify(metadata) + "\n"
    : JSON.stringify(metadata, null, 2) + "\n";
}

/** Emits per-module metadata files for fine-grained lazy loading. */
export function emitSplitMetadata(
  schema: Schema,
  options?: EmitMetadataOptions,
): Map<string, string> {
  const result = new Map<string, string>();
  const indent = options?.minify ? undefined : 2;
  for (const program of schema.programs) {
    const single: Metadata[] = [{ path: program.path, name: program.name, ast: program.ast }];
    result.set(program.name, JSON.stringify(single, null, indent) + "\n");
  }
  return result;
}
