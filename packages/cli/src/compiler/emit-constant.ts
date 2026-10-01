import { type BinaryMode, type ValueType, binaryToString } from "@vality/tsthrift";
import type { Program } from "./load-schema.ts";
import { resolveType } from "./resolve-type.ts";
import { constantReference, referenceName } from "./constant-reference.ts";
import { emitScalarConstant } from "./emit-scalar-constant.ts";
import type { I64Mode } from "./i64-mode.ts";

export function emitConstant(
  program: Program,
  type: ValueType,
  value: unknown,
  i64: I64Mode,
  scope: Program = program,
  seen: Set<string> = new Set<string>(),
  binary: BinaryMode = "base64",
): string {
  const reference = referenceName(value);
  if (reference !== undefined) {
    const constant = constantReference(scope, reference);
    if (seen.has(constant.identity))
      throw new Error(`Circular constant reference ${constant.identity}`);
    return emitConstant(
      program,
      type,
      constant.value,
      i64,
      constant.scope,
      new Set([...seen, constant.identity]),
      binary,
    );
  }
  const resolved = resolveType(program, type);
  const emit = (childType: ValueType, child: unknown) =>
    emitConstant(resolved.program, childType, child, i64, scope, seen, binary);
  if (typeof resolved.type === "object") {
    if (!Array.isArray(value)) throw new Error(`Unsupported constant value in ${program.path}`);
    const container = resolved.type;
    const entries = value
      .map((item: unknown) => {
        if (container.name !== "map") return emit(container.valueType, item);
        if (!item || typeof item !== "object" || !("key" in item) || !("value" in item)) {
          throw new Error(`Invalid map constant entry in ${program.path}`);
        }
        return `[${emit(container.keyType, item.key)}, ${emit(container.valueType, item.value)}]`;
      })
      .join(", ");
    if (container.name === "list") return `[${entries}]`;
    return `new globalThis.${container.name === "map" ? "Map" : "Set"}([${entries}])`;
  }
  if (resolved.kind && resolved.kind !== "enum") {
    if (!Array.isArray(value))
      throw new Error(`Invalid ${resolved.kind} constant in ${program.path}`);
    const fields = resolved.program.ast[resolved.kind]![resolved.type]!;
    const values = new Map<string, unknown>();
    for (const entry of value as unknown[]) {
      if (!entry || typeof entry !== "object" || !("key" in entry) || !("value" in entry)) {
        throw new Error(`Invalid struct constant entry in ${program.path}`);
      }
      const key = typeof entry.key === "string" ? entry.key : referenceName(entry.key);
      if (!key || !fields.some((field) => field.name === key))
        throw new Error(`Unknown constant field ${key} in ${program.path}`);
      if (values.has(key)) throw new Error(`Duplicate constant field ${key} in ${program.path}`);
      values.set(key, entry.value);
    }
    if (resolved.kind === "union" && values.size !== 1) {
      throw new Error(`Union constant must contain exactly one field in ${program.path}`);
    }
    const entries: string[] = [];
    for (const field of fields) {
      if (values.has(field.name)) {
        entries.push(
          `[${JSON.stringify(field.name)}]: ${emit(field.type, values.get(field.name))}`,
        );
      } else if (resolved.kind !== "union") {
        if (field.defaultValue !== undefined) {
          const identity = `default ${resolved.program.filename}:${resolved.type}.${field.name}`;
          if (seen.has(identity)) throw new Error(`Circular constant default ${identity}`);
          entries.push(
            `[${JSON.stringify(field.name)}]: ${emitConstant(resolved.program, field.type, field.defaultValue, i64, resolved.program, new Set([...seen, identity]), binary)}`,
          );
        } else if (field.option === "required") {
          throw new Error(
            `Missing constant field ${resolved.type}.${field.name} in ${program.path}`,
          );
        }
      }
    }
    return `{ ${entries.join(", ")} }`;
  }
  if (resolved.type === "binary") {
    const literal = emitScalarConstant("binary", value, program.path, i64);
    return binary === "uint8array"
      ? `new TextEncoder().encode(${literal})`
      : JSON.stringify(binaryToString(new TextEncoder().encode(value as string), "base64"));
  }
  return emitScalarConstant(
    resolved.kind === "enum" ? "i32" : resolved.type,
    value,
    program.path,
    i64,
  );
}
