import type { MetadataIndex } from "./metadata-index.ts";
import type { ClassRegistry, I64Mode, ValueType } from "./types.ts";

export interface ToThriftInstanceContext {
  index: MetadataIndex;
  i64Mode: I64Mode;
  classRegistry?: ClassRegistry;
}

export function toThriftInstance(
  value: unknown,
  type: ValueType,
  namespace: string,
  context: ToThriftInstanceContext,
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (
    typeof value === "object" &&
    typeof (value as any).write === "function" &&
    typeof (value as any).read === "function"
  ) {
    return value;
  }

  const resolved = context.index.resolveType(type, namespace);

  if (resolved.kind === "primitive") {
    if (resolved.type === "i64") {
      if (typeof value === "number") {
        if (!Number.isSafeInteger(value)) {
          throw new RangeError(`Number ${value} is outside safe integer range for i64`);
        }
        return BigInt(value);
      }
      if (typeof value === "string") {
        return BigInt(value);
      }
      if (typeof value === "bigint") {
        return value;
      }
      throw new TypeError(`Expected number or bigint for i64, got ${typeof value}`);
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
        throw new TypeError(`Expected array for list, got ${typeof value}`);
      }
      return value.map((item) =>
        toThriftInstance(item, complexType.valueType, resolved.namespace, context),
      );
    }

    if (complexType.name === "set") {
      const items = value instanceof Set ? Array.from(value) : Array.isArray(value) ? value : [];
      return items.map((item) =>
        toThriftInstance(item, complexType.valueType, resolved.namespace, context),
      );
    }

    if (complexType.name === "map") {
      const entries: [unknown, unknown][] =
        value instanceof Map
          ? Array.from(value.entries())
          : typeof value === "object"
            ? Object.entries(value)
            : [];

      return new Map(
        entries.map(([k, v]) => [
          toThriftInstance(k, complexType.keyType, resolved.namespace, context),
          toThriftInstance(v, complexType.valueType, resolved.namespace, context),
        ]),
      );
    }
  }

  if (resolved.kind === "union") {
    if (typeof value !== "object" || value === null) {
      throw new TypeError(`Expected object for union, got ${typeof value}`);
    }
    const entries = Object.entries(value).filter(([, v]) => v !== undefined && v !== null);
    if (entries.length === 0) {
      const Constructor = resolveConstructor(
        resolved.namespace,
        resolved.name,
        context.classRegistry,
      );
      return Constructor ? new Constructor() : {};
    }
    const [variantKey, variantVal] = entries[0]!;
    const field = resolved.fields.find((f) => f.name === variantKey);
    const converted = field
      ? toThriftInstance(variantVal, field.type, resolved.namespace, context)
      : variantVal;

    const unionObj = { [variantKey]: converted };
    const Constructor = resolveConstructor(
      resolved.namespace,
      resolved.name,
      context.classRegistry,
    );
    return Constructor ? new Constructor(unionObj) : unionObj;
  }

  if (resolved.kind === "struct" || resolved.kind === "exception") {
    if (typeof value !== "object" || value === null) {
      throw new TypeError(
        `Expected object for ${resolved.kind} ${resolved.name}, got ${typeof value}`,
      );
    }

    const instanceObj: Record<string, unknown> = {};
    for (const field of resolved.fields) {
      if (field.name in (value as object)) {
        const raw = (value as Record<string, unknown>)[field.name];
        if (raw !== undefined && raw !== null) {
          instanceObj[field.name] = toThriftInstance(raw, field.type, resolved.namespace, context);
        } else if (raw === null) {
          instanceObj[field.name] = null;
        }
      }
    }

    const Constructor = resolveConstructor(
      resolved.namespace,
      resolved.name,
      context.classRegistry,
    );
    return Constructor ? new Constructor(instanceObj) : instanceObj;
  }

  return value;
}

function resolveConstructor(
  namespace: string,
  typeName: string,
  registry?: ClassRegistry,
): (new (args?: any) => any) | undefined {
  if (!registry) return undefined;
  if (typeof registry === "function") {
    return registry(namespace, typeName);
  }
  return registry[namespace]?.[typeName] ?? registry[typeName];
}
