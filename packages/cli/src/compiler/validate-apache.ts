import type { ValueType } from "../metadata/schema.ts";
import type { Program, Schema } from "./load-schema.ts";
import { resolveType } from "./resolve-type.ts";

function validateType(program: Program, type: ValueType, seen = new Set<ValueType>()): void {
  const resolved = resolveType(program, type);
  if (typeof resolved.type === "string" || seen.has(resolved.type)) return;
  seen.add(resolved.type);
  if (resolved.type.name === "map") {
    const key = resolveType(resolved.program, resolved.type.keyType);
    if (
      key.kind !== "enum" &&
      (typeof key.type !== "string" ||
        !["string", "byte", "i8", "i16", "i32", "i64"].includes(key.type))
    ) {
      throw new Error(
        `Unsupported map key in ${program.path}: official JS uses object keys; use --target models or metadata`,
      );
    }
  }
  validateType(resolved.program, resolved.type.valueType, seen);
}

/** Constraints of Apache JS output, not of Thrift IDL. */
export function validateApache(schema: Schema): void {
  const outputs = new Set<string>();
  for (const program of schema.programs) {
    for (const filename of [
      `${program.name}_types.js`,
      ...Object.keys(program.ast.service ?? {}).map((name) => `${name}.js`),
    ]) {
      if (outputs.has(filename)) throw new Error(`Conflicting generated JS filename: ${filename}`);
      outputs.add(filename);
    }
    for (const alias of Object.values(program.ast.typedef ?? {})) validateType(program, alias.type);
    for (const constant of Object.values(program.ast.const ?? {}))
      validateType(program, constant.type);
    for (const group of [program.ast.struct, program.ast.union, program.ast.exception]) {
      for (const fields of Object.values(group ?? {})) {
        for (const field of fields) validateType(program, field.type);
      }
    }
    for (const service of Object.values(program.ast.service ?? {})) {
      for (const method of Object.values(service.functions)) {
        validateType(program, method.type);
        for (const field of [...method.args, ...method.throws]) validateType(program, field.type);
      }
    }
  }
}
