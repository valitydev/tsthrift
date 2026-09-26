import type { ValueType } from "@vality/tsthrift";
import type { Program } from "./load-schema.ts";

export const primitives = new Set([
  "void",
  "bool",
  "byte",
  "i8",
  "i16",
  "i32",
  "i64",
  "double",
  "string",
  "binary",
]);

export function resolveReference(program: Program, reference: string) {
  const parts = reference.split(".");
  if (parts.length === 1) return { program, name: reference };
  const included = program.includes.get(parts[0]!);
  if (parts.length !== 2 || !included) {
    throw new Error(`Unresolved reference ${reference} in ${program.path}`);
  }
  return { program: included, name: parts[1]! };
}

export function resolveType(
  program: Program,
  type: ValueType,
  seen = new Set<string>(),
): { program: Program; type: ValueType; kind?: "enum" | "struct" | "union" | "exception" } {
  if (typeof type !== "string" || primitives.has(type)) return { program, type };
  const resolved = resolveReference(program, type);
  const identity = `${resolved.program.filename}:${resolved.name}`;
  if (seen.has(identity)) throw new Error(`Circular typedef ${identity}`);
  const alias = resolved.program.ast.typedef?.[resolved.name];
  if (alias) return resolveType(resolved.program, alias.type, new Set([...seen, identity]));
  for (const kind of ["enum", "struct", "union", "exception"] as const) {
    if (Object.hasOwn(resolved.program.ast[kind] ?? {}, resolved.name)) {
      return { program: resolved.program, type: resolved.name, kind };
    }
  }
  throw new Error(`Unresolved type ${type} in ${program.path}`);
}
