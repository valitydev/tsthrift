import type { ValueType } from "../metadata/schema.ts";
import type { Program, Schema } from "./load-schema.ts";
import { resolveReference, resolveType } from "./resolve-type.ts";

function validateNumbers(value: unknown, location: string): void {
  if (
    typeof value === "number" &&
    (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))
  ) {
    throw new Error(`Unsafe numeric literal in ${location}; metadata cannot preserve it exactly`);
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) validateNumbers(child, `${location}.${key}`);
  }
}

function validateType(program: Program, type: ValueType, seen = new Set<ValueType>()): void {
  const resolved = resolveType(program, type);
  if (typeof resolved.type === "string" || seen.has(resolved.type)) return;
  seen.add(resolved.type);
  const container = resolved.type;
  if (container.name === "map") {
    const key = resolveType(resolved.program, container.keyType);
    if (
      key.kind !== "enum" &&
      (typeof key.type !== "string" ||
        !["string", "byte", "i8", "i16", "i32", "i64"].includes(key.type))
    ) {
      throw new Error(`Unsupported map key in ${program.path}: official JS uses object keys`);
    }
    validateType(resolved.program, container.keyType, seen);
  }
  validateType(resolved.program, container.valueType, seen);
}

function validateService(program: Program, name: string, seen = new Set<string>()): void {
  const id = `${program.filename}:${name}`;
  if (seen.has(id)) throw new Error(`Circular service inheritance: ${id}`);
  const service = program.ast.service?.[name];
  if (!service) throw new Error(`Unresolved service ${name} in ${program.path}`);
  if (service.extends) {
    const parent = resolveReference(program, service.extends);
    validateService(parent.program, parent.name, new Set([...seen, id]));
  }
  for (const method of Object.values(service.functions)) {
    if (method.args.some((arg) => arg.name === "callback")) {
      throw new Error(
        `Unsupported callback argument in ${program.name}.${name}.${method.name}: requires the fork's collision fix`,
      );
    }
    validateType(program, method.type);
    for (const field of [...method.args, ...method.throws]) validateType(program, field.type);
  }
}

export function validateSchema(schema: Schema): void {
  const outputs = new Set<string>();
  for (const program of schema.programs) {
    validateNumbers(program.ast, program.path);
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
    for (const name of Object.keys(program.ast.service ?? {})) validateService(program, name);
  }
}
