import type { Program, Schema } from "../schema.ts";
import type { Metadata } from "@vality/tsthrift";

/** Includes every reachable module while preserving the legacy AST and existing module order. */
export function schemaMetadata(schema: Schema, build?: Metadata["build"]): Metadata[] {
  const programs = new Map(schema.programs.map((program) => [program.name, program]));
  const includeDependencies = (program: Program): void => {
    for (const dependency of program.includes.values()) {
      if (programs.has(dependency.name)) continue;
      programs.set(dependency.name, dependency);
      includeDependencies(dependency);
    }
  };
  for (const program of schema.programs) includeDependencies(program);
  return [...programs.values()].map(({ path, name, ast }) => ({
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
