import { MetadataIndex } from "./index.ts";
import type { Field, I64Mode, ValueType } from "./types.ts";
import * as scalar from "../codecs/scalar.ts";
import { list, map, set } from "../codecs/collections.ts";
import { type WireField, struct } from "../codecs/struct.ts";
import { evaluateDefault } from "./defaults.ts";
import { DEFAULT_MAX_DEPTH } from "../runtime/wire.ts";

/** Resolves metadata once and retains recursive codec identities for this schema. */
export class MetadataCodecs {
  private readonly structs = new Map<string, scalar.Codec>();

  constructor(
    readonly index: MetadataIndex,
    readonly i64Mode: I64Mode,
  ) {}

  type(type: ValueType, namespace: string, depth = 0): scalar.Codec {
    if (depth >= DEFAULT_MAX_DEPTH) throw new Error("Metadata type exceeds nesting limit");
    const resolved = this.index.resolveType(type, namespace);
    if (resolved.kind === "primitive") {
      switch (resolved.type) {
        case "bool":
          return scalar.bool;
        case "byte":
        case "i8":
          return scalar.byte;
        case "i16":
          return scalar.i16;
        case "i32":
          return scalar.i32;
        case "i64":
          return this.i64Mode === "number" ? scalar.i64Number : scalar.i64;
        case "double":
          return scalar.double;
        case "string":
          return scalar.string;
        case "binary":
          return scalar.binary;
        case "uuid":
          return scalar.uuid;
        default:
          throw new Error(`Unknown metadata type ${namespace}.${resolved.type}`);
      }
    }
    if (resolved.kind === "enum") return scalar.i32;
    if (resolved.kind === "complex") {
      const value = this.type(resolved.type.valueType, resolved.namespace, depth + 1);
      switch (resolved.type.name) {
        case "list":
          return list(value);
        case "set":
          return set(value);
        case "map":
          return map(this.type(resolved.type.keyType, resolved.namespace, depth + 1), value);
        default:
          throw new Error("Unknown metadata container");
      }
    }
    const identity = `${resolved.namespace}.${resolved.name}`;
    const cached = this.structs.get(identity);
    if (cached) return cached;
    let fields: WireField[] = [];
    const codec = struct(identity, () => fields, resolved.kind === "union");
    this.structs.set(identity, codec);
    fields = this.fields(resolved.fields, resolved.namespace, depth + 1);
    return codec;
  }

  fields(fields: Field[], namespace: string, depth = 0): WireField[] {
    let implicitId = -1;
    const ids = new Set<number>();
    const names = new Set<string>();
    return fields.map((field) => {
      const id = field.id ?? implicitId--;
      if (field.id !== undefined && field.id < 0) implicitId = field.id - 1;
      if (
        !Number.isInteger(id) ||
        id < -32768 ||
        id > 32767 ||
        ids.has(id) ||
        names.has(field.name)
      )
        throw new Error(`Invalid or duplicate metadata field ${namespace}.${field.name} (${id})`);
      ids.add(id);
      names.add(field.name);
      const codec = this.type(field.type, namespace, depth);
      const value =
        field.defaultValue === undefined
          ? undefined
          : evaluateDefault(this.index, this.i64Mode, field.type, namespace, field.defaultValue);
      return {
        id,
        name: field.name,
        codec,
        required: field.option === "required",
        ...(value === undefined
          ? {}
          : {
              defaultValue: () =>
                value !== null && typeof value === "object" ? structuredClone(value) : value,
            }),
      };
    });
  }
}
