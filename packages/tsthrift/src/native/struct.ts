import { WireType } from "../runtime/wire.ts";
import { type Codec, nextDepth } from "./codec.ts";

export interface WireField {
  id: number;
  name: string;
  codec: Codec;
  required?: boolean;
  defaultValue?: () => unknown;
}

/** Field factories permit recursive structs and forward references. */
export function struct(
  name: string,
  fields: () => WireField[],
  union = false,
): Codec<Record<string, any>> {
  let definitions: WireField[] | undefined;
  let byId: Map<number, WireField>;
  const getFields = () => {
    if (!definitions) {
      definitions = fields();
      byId = new Map(definitions.map((field) => [field.id, field]));
    }
    return definitions;
  };
  return {
    type: WireType.Struct,
    read(reader, depth) {
      const nested = nextDepth(depth);
      const known = getFields();
      const values = new Map<string, unknown>();
      let count = 0;
      while (true) {
        const header = reader.readFieldBegin();
        if (header.type === WireType.Stop) break;
        const field = byId.get(header.id);
        if (!field || field.codec.type !== header.type) {
          reader.skip(header.type);
          continue;
        }
        if (values.has(field.name)) throw new Error(`Duplicate field ${name}.${field.name}`);
        values.set(field.name, field.codec.read(reader, nested));
        count++;
      }
      if (union && count > 1) throw new Error(`Multiple fields in union ${name}`);
      for (const field of known) {
        if (values.has(field.name)) continue;
        if (field.required) throw new Error(`Missing required field ${name}.${field.name}`);
        if (!union && field.defaultValue) values.set(field.name, field.defaultValue());
      }
      return Object.fromEntries(values);
    },
    write(writer, value, depth) {
      const nested = nextDepth(depth);
      if (!value || typeof value !== "object") throw new TypeError(`Expected struct ${name}`);
      let count = 0;
      for (const field of getFields()) {
        const raw = Object.hasOwn(value, field.name) ? value[field.name] : undefined;
        const item = raw ?? (!union ? field.defaultValue?.() : undefined);
        if (item === undefined || item === null) {
          if (field.required) throw new Error(`Missing required field ${name}.${field.name}`);
          continue;
        }
        if (union && ++count > 1) throw new Error(`Multiple fields in union ${name}`);
        writer.writeFieldBegin(field.codec.type, field.id);
        field.codec.write(writer, item, nested);
      }
      writer.writeFieldStop();
    },
  };
}
