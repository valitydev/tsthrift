import type { ValueType } from "@vality/tsthrift";
import type { I64Mode } from "./i64-mode.ts";

/** Maps an IDL type to its generated TypeScript type; `named` qualifies user-defined types. */
export function tsType(
  type: ValueType,
  i64: I64Mode,
  named: (name: string) => string = (name) => name,
): string {
  if (typeof type !== "string") {
    if (type.name === "map")
      return `globalThis.Map<${tsType(type.keyType, i64, named)}, ${tsType(type.valueType, i64, named)}>`;
    return type.name === "set"
      ? `globalThis.Set<${tsType(type.valueType, i64, named)}>`
      : `${tsType(type.valueType, i64, named)}[]`;
  }
  if (type === "void") return "void";
  if (type === "string" || type === "uuid") return "string";
  if (type === "bool") return "boolean";
  if (type === "i64") return i64;
  if (["byte", "i8", "i16", "i32", "double"].includes(type)) return "number";
  if (type === "binary") return "Uint8Array";
  return named(type);
}
