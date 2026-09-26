import type { MetadataIndex } from "./metadata-index.ts";
import type { I64Mode, ValueType } from "./types.ts";

export interface ToPlainObjectContext {
  index: MetadataIndex;
  i64Mode: I64Mode;
}

export function toPlainObject(
  value: unknown,
  type: ValueType,
  namespace: string,
  context: ToPlainObjectContext,
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  const resolved = context.index.resolveType(type, namespace);

  if (resolved.kind === "primitive") {
    if (resolved.type === "i64") {
      if (context.i64Mode === "number") {
        if (typeof value === "bigint") {
          if (value < BigInt(Number.MIN_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER)) {
            throw new RangeError(`BigInt ${value} is outside safe integer range for number mode`);
          }
          return Number(value);
        }
        if (typeof value === "number") {
          return value;
        }
      } else {
        return typeof value === "bigint" ? value : BigInt(value as string | number);
      }
    }
    return value;
  }

  if (resolved.kind === "enum") {
    return value;
  }

  if (resolved.kind === "complex") {
    const complexType = resolved.type as
      | { name: "list"; valueType: ValueType }
      | { name: "set"; valueType: ValueType }
      | { name: "map"; keyType: ValueType; valueType: ValueType };

    if (complexType.name === "list") {
      if (!Array.isArray(value)) {
        return value;
      }
      return value.map((item) => toPlainObject(item, complexType.valueType, namespace, context));
    }

    if (complexType.name === "set") {
      const items = value instanceof Set ? Array.from(value) : Array.isArray(value) ? value : [];
      return new Set(
        items.map((item) => toPlainObject(item, complexType.valueType, namespace, context)),
      );
    }

    if (complexType.name === "map") {
      const entries: [unknown, unknown][] =
        value instanceof Map
          ? Array.from(value.entries())
          : typeof value === "object"
            ? Object.entries(value as object)
            : [];

      return new Map(
        entries.map(([k, v]) => [
          toPlainObject(k, complexType.keyType, namespace, context),
          toPlainObject(v, complexType.valueType, namespace, context),
        ]),
      );
    }
  }

  if (resolved.kind === "union") {
    if (typeof value !== "object" || value === null) {
      return value;
    }
    const entries = Object.entries(value).filter(
      ([k, v]) => v !== undefined && v !== null && resolved.fields.some((f) => f.name === k),
    );
    if (entries.length === 0) {
      return {};
    }
    const [variantKey, variantVal] = entries[0]!;
    const field = resolved.fields.find((f) => f.name === variantKey);
    return {
      [variantKey]: field
        ? toPlainObject(variantVal, field.type, resolved.namespace, context)
        : variantVal,
    };
  }

  if (resolved.kind === "struct" || resolved.kind === "exception") {
    if (typeof value !== "object" || value === null) {
      return value;
    }

    const result: Record<string, unknown> = {};
    for (const field of resolved.fields) {
      if (field.name in (value as object)) {
        const raw = (value as Record<string, unknown>)[field.name];
        if (raw !== undefined && raw !== null) {
          result[field.name] = toPlainObject(raw, field.type, resolved.namespace, context);
        }
      }
    }
    return result;
  }

  return value;
}
