import { WireType } from "../runtime/wire.ts";
import { type Codec, nextDepth } from "./scalar.ts";

export function list<T>(element: Codec<T>): Codec<T[]> {
  return {
    type: WireType.List,
    read(reader, depth) {
      const nested = nextDepth(depth);
      const header = reader.readCollectionBegin();
      if (header.elementType !== element.type) throw new Error("List element type mismatch");
      return Array.from({ length: header.size }, () => element.read(reader, nested));
    },
    write(writer, value, depth) {
      const nested = nextDepth(depth);
      if (!Array.isArray(value)) throw new TypeError("Expected Array");
      writer.writeCollectionBegin(element.type, value.length);
      for (const item of value) element.write(writer, item, nested);
    },
  };
}

export function set<T>(element: Codec<T>): Codec<Set<T>> {
  const items = list(element);
  return {
    type: WireType.Set,
    read: (reader, depth) => new Set(items.read(reader, depth)),
    write(writer, value, depth) {
      if (!(value instanceof Set)) throw new TypeError("Expected Set");
      items.write(writer, Array.from(value), depth);
    },
  };
}

export function map<K, V>(key: Codec<K>, value: Codec<V>): Codec<Map<K, V>> {
  return {
    type: WireType.Map,
    read(reader, depth) {
      const nested = nextDepth(depth);
      const header = reader.readMapBegin();
      if (header.keyType !== key.type || header.valueType !== value.type)
        throw new Error("Map key/value type mismatch");
      const result = new Map<K, V>();
      for (let i = 0; i < header.size; i++) {
        result.set(key.read(reader, nested), value.read(reader, nested));
      }
      return result;
    },
    write(writer, entries, depth) {
      const nested = nextDepth(depth);
      if (!(entries instanceof Map)) throw new TypeError("Expected Map");
      writer.writeMapBegin(key.type, value.type, entries.size);
      for (const [k, v] of entries) {
        key.write(writer, k, nested);
        value.write(writer, v, nested);
      }
    },
  };
}
