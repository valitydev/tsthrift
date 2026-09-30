import type { MetadataIndex } from "./index.ts";
import type { I64Mode, ValueType } from "./types.ts";
import { numberToI64 } from "../runtime/i64.ts";
import { DEFAULT_MAX_DEPTH } from "../runtime/wire.ts";

function reference(value: unknown): string[] | undefined {
  if (!value || typeof value !== "object" || !("=" in value)) return undefined;
  const parts = value["="];
  if (!Array.isArray(parts) || !parts.every((part) => typeof part === "string"))
    throw new Error("Invalid metadata constant reference");
  return parts;
}

/** Evaluates parser constant expressions as values, never as JavaScript source. */
export function evaluateDefault(
  index: MetadataIndex,
  mode: I64Mode,
  type: ValueType,
  namespace: string,
  value: unknown,
  scope: string = namespace,
  seen: Set<string> = new Set<string>(),
  depth = 0,
): unknown {
  if (depth >= DEFAULT_MAX_DEPTH) throw new Error("Metadata default exceeds nesting limit");
  const parts = reference(value)?.join(".").split(".");
  if (parts) {
    let owner = scope;
    if (parts.length > 1 && index.getMetadata(owner)?.ast.include?.[parts[0]!]) {
      const resolved = index.resolveName(`${parts[0]}.${parts[1]}`, owner);
      owner = resolved.namespace;
      parts.shift();
    }
    const key = `${owner}.${parts.join(".")}`;
    if (seen.has(key)) throw new Error(`Circular metadata constant ${key}`);
    const ast = index.getMetadata(owner)?.ast;
    if (parts.length === 1 && Object.hasOwn(ast?.const ?? {}, parts[0]!)) {
      return evaluateDefault(
        index,
        mode,
        type,
        namespace,
        ast!.const![parts[0]!]!.value,
        owner,
        new Set([...seen, key]),
        depth + 1,
      );
    }
    const enumeration = parts.length === 2 ? ast?.enum?.[parts[0]!] : undefined;
    if (enumeration) {
      let current = -1;
      for (const item of enumeration.items) {
        current = item.value ?? current + 1;
        if (item.name === parts[1])
          return evaluateDefault(index, mode, type, namespace, current, owner, seen, depth + 1);
      }
    }
    throw new Error(`Unresolved metadata constant ${key}`);
  }
  const resolved = index.resolveType(type, namespace);
  const child = (childType: ValueType, owner: string, childValue: unknown) =>
    evaluateDefault(index, mode, childType, owner, childValue, scope, seen, depth + 1);
  if (resolved.kind === "complex") {
    if (!Array.isArray(value)) throw new Error("Expected metadata collection constant");
    const container = resolved.type;
    if (container.name === "map")
      return new Map(
        value.map((entry) => {
          if (!entry || typeof entry !== "object" || !("key" in entry) || !("value" in entry))
            throw new Error("Invalid metadata map entry");
          return [
            child(container.keyType, resolved.namespace, entry.key),
            child(container.valueType, resolved.namespace, entry.value),
          ];
        }),
      );
    const items = value.map((item) => child(container.valueType, resolved.namespace, item));
    return container.name === "set" ? new Set(items) : items;
  }
  if (resolved.kind === "struct" || resolved.kind === "union" || resolved.kind === "exception") {
    if (!Array.isArray(value)) throw new Error("Expected metadata struct constant");
    const values = new Map<string, unknown>();
    for (const entry of value) {
      if (!entry || typeof entry !== "object" || !("key" in entry) || !("value" in entry))
        throw new Error("Invalid metadata struct entry");
      const name = typeof entry.key === "string" ? entry.key : reference(entry.key)?.join(".");
      const field = resolved.fields.find((item) => item.name === name);
      if (!field || values.has(field.name))
        throw new Error(`Unknown or duplicate metadata default field ${name}`);
      values.set(field.name, child(field.type, resolved.namespace, entry.value));
    }
    if (resolved.kind === "union") {
      if (values.size !== 1) throw new Error("Union default must contain exactly one field");
    } else
      for (const field of resolved.fields) {
        if (values.has(field.name)) continue;
        if (field.defaultValue !== undefined) {
          values.set(
            field.name,
            evaluateDefault(
              index,
              mode,
              field.type,
              resolved.namespace,
              field.defaultValue,
              resolved.namespace,
              seen,
              depth + 1,
            ),
          );
        } else if (field.option === "required")
          throw new Error(`Missing metadata constant field ${field.name}`);
      }
    return Object.fromEntries(values);
  }
  const scalar =
    resolved.kind === "enum" ? "i32" : resolved.kind === "primitive" ? resolved.type : "unknown";
  if (scalar === "string" || scalar === "binary" || scalar === "uuid") {
    if (typeof value !== "string") throw new Error(`Invalid ${scalar} default`);
    return scalar === "binary" ? new TextEncoder().encode(value) : value;
  }
  if (scalar === "bool") {
    if (typeof value === "boolean") return value;
    if (value === 0 || value === 1) return Boolean(value);
    throw new Error("Invalid bool default");
  }
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`Invalid ${scalar} default`);
  if (scalar === "double") return value;
  const bounds: Record<string, [number, number]> = {
    byte: [-128, 127],
    i8: [-128, 127],
    i16: [-32768, 32767],
    i32: [-2147483648, 2147483647],
    i64: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
  };
  const range = bounds[scalar];
  if (!range || !Number.isSafeInteger(value) || value < range[0] || value > range[1])
    throw new Error(`Invalid ${scalar} default`);
  return scalar === "i64" && mode === "bigint" ? numberToI64(value) : value;
}
