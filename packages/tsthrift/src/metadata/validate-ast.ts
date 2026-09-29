import type { ThriftAst } from "./types.ts";

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`Invalid ${label}`);
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string): void {
  if (typeof value !== "string" || !value) throw new TypeError(`Invalid ${label}`);
}
function valueType(value: unknown, depth = 0): void {
  if (depth > 64) throw new TypeError("Metadata type nesting exceeds 64");
  if (typeof value === "string" && value) return;
  const type = record(value, "type");
  if (!["list", "set", "map"].includes(type.name as string))
    throw new TypeError("Invalid container type");
  valueType(type.valueType, depth + 1);
  if (type.name === "map") valueType(type.keyType, depth + 1);
}
function fields(value: unknown): void {
  if (!Array.isArray(value)) throw new TypeError("Expected metadata fields array");
  for (const entry of value) {
    const field = record(entry, "field");
    text(field.name, "field name");
    valueType(field.type);
    if (field.id !== undefined && !Number.isInteger(field.id))
      throw new TypeError("Invalid field ID");
    if (field.option !== undefined && !["optional", "required"].includes(field.option as string))
      throw new TypeError("Invalid field requiredness");
  }
}

/** Validates the parser boundary without changing the legacy AST representation. */
export function validateThriftAst(value: unknown): asserts value is ThriftAst {
  const ast = record(value, "Thrift AST");
  for (const kind of ["struct", "union", "exception"] as const) {
    for (const entry of Object.values(record(ast[kind] ?? {}, kind))) fields(entry);
  }
  for (const [kind, key] of [
    ["include", "path"],
    ["namespace", "serviceName"],
  ] as const) {
    for (const entry of Object.values(record(ast[kind] ?? {}, kind)))
      text(record(entry, kind)[key], key);
  }
  for (const kind of ["typedef", "const"] as const) {
    for (const entry of Object.values(record(ast[kind] ?? {}, kind)))
      valueType(record(entry, kind).type);
  }
  for (const entry of Object.values(record(ast.enum ?? {}, "enum"))) {
    const enumeration = record(entry, "enum");
    if (!Array.isArray(enumeration.items)) throw new TypeError("Invalid enum members");
    for (const item of enumeration.items) {
      const member = record(item, "enum member");
      text(member.name, "enum member name");
      if (member.value !== undefined && !Number.isInteger(member.value))
        throw new TypeError("Invalid enum value");
    }
  }
  for (const entry of Object.values(record(ast.service ?? {}, "service"))) {
    const service = record(entry, "service");
    if (service.extends !== undefined) text(service.extends, "parent service");
    for (const item of Object.values(record(service.functions, "methods"))) {
      const method = record(item, "method");
      text(method.name, "method name");
      valueType(method.type);
      fields(method.args);
      fields(method.throws);
      if (typeof method.oneway !== "boolean") throw new TypeError("Invalid oneway flag");
    }
  }
}
