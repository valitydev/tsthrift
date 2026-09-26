import type { ValueType } from "../metadata/schema.ts";
import type { Program } from "./load-schema.ts";
import { resolveType } from "./resolve-type.ts";

export function emitConstant(program: Program, type: ValueType, value: unknown): string {
  const resolved = resolveType(program, type);
  if (typeof resolved.type === "object") {
    if (!Array.isArray(value)) throw new Error(`Unsupported constant value in ${program.path}`);
    const container = resolved.type;
    const entries = value
      .map((item: unknown) => {
        if (container.name !== "map")
          return emitConstant(resolved.program, container.valueType, item);
        const pair = item as { key: unknown; value: unknown };
        return `[${emitConstant(resolved.program, container.keyType, pair.key)}, ${emitConstant(resolved.program, container.valueType, pair.value)}]`;
      })
      .join(", ");
    if (container.name === "list") return `[${entries}]`;
    return `new globalThis.${container.name === "map" ? "Map" : "Set"}([${entries}])`;
  }
  if (value === null || typeof value === "object" || value === undefined) {
    throw new Error(`Referenced or structured constants are not supported yet in ${program.path}`);
  }
  if (resolved.type === "bool" && typeof value === "number") return value ? "true" : "false";
  return JSON.stringify(value);
}
