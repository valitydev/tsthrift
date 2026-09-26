import type { Field, ValueType } from "../metadata/schema.ts";
import type { Program, Schema } from "./load-schema.ts";
import { resolveReference, resolveType } from "./resolve-type.ts";
import { enumMembers } from "./enum-members.ts";

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
    validateType(resolved.program, container.keyType, seen);
  }
  validateType(resolved.program, container.valueType, seen);
}

function validateFields(program: Program, fields: Field[], location: string): void {
  const ids = new Set<number>();
  const names = new Set<string>();
  for (const field of fields) {
    if (names.has(field.name)) throw new Error(`Duplicate field ${location}.${field.name}`);
    names.add(field.name);
    if (field.id !== undefined) {
      if (!Number.isInteger(field.id) || field.id < -32768 || field.id > 32767) {
        throw new Error(`Field ID outside i16 range: ${location}.${field.name}`);
      }
      if (ids.has(field.id)) throw new Error(`Duplicate field ID ${field.id} in ${location}`);
      ids.add(field.id);
    }
    validateType(program, field.type);
  }
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
    validateType(program, method.type);
    validateFields(program, method.args, `${program.path}:${name}.${method.name}.args`);
    validateFields(program, method.throws, `${program.path}:${name}.${method.name}.throws`);
  }
}

export function validateSchema(schema: Schema): void {
  for (const program of schema.programs) {
    validateNumbers(program.ast, program.path);
    for (const [name, enumeration] of Object.entries(program.ast.enum ?? {})) {
      enumMembers(enumeration, `${program.path}:${name}`);
    }
    for (const alias of Object.values(program.ast.typedef ?? {})) validateType(program, alias.type);
    for (const constant of Object.values(program.ast.const ?? {}))
      validateType(program, constant.type);
    for (const group of [program.ast.struct, program.ast.union, program.ast.exception]) {
      for (const [name, fields] of Object.entries(group ?? {})) {
        validateFields(program, fields, `${program.path}:${name}`);
      }
    }
    for (const name of Object.keys(program.ast.service ?? {})) validateService(program, name);
  }
}
