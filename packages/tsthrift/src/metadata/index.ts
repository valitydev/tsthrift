import type { Field, Metadata, Method, Service, ValueType } from "./types.ts";

export type ResolvedEntity =
  | { kind: "primitive"; type: string }
  | { kind: "complex"; type: Exclude<ValueType, string>; namespace: string }
  | { kind: "enum"; namespace: string; name: string }
  | { kind: "struct" | "union" | "exception"; namespace: string; name: string; fields: Field[] };

const PRIMITIVE_TYPES = new Set([
  "bool",
  "byte",
  "i8",
  "i16",
  "i32",
  "i64",
  "double",
  "string",
  "binary",
]);

export class MetadataIndex {
  private byNamespace = new Map<string, Metadata>();
  private byPath = new Map<string, Metadata>();

  constructor(metadata: Metadata[] = []) {
    for (const item of metadata) {
      if (this.byNamespace.has(item.name) || this.byPath.has(item.path))
        throw new Error(`Duplicate metadata module: ${item.name} (${item.path})`);
      this.byNamespace.set(item.name, item);
      this.byPath.set(item.path, item);
    }
  }

  getMetadata(namespace: string): Metadata | undefined {
    return this.byNamespace.get(namespace);
  }

  resolveType(
    rawType: ValueType,
    currentNamespace: string,
    seen = new Set<string>(),
  ): ResolvedEntity {
    if (typeof rawType === "object") {
      return { kind: "complex", type: rawType, namespace: currentNamespace };
    }

    if (PRIMITIVE_TYPES.has(rawType)) {
      return { kind: "primitive", type: rawType };
    }

    const { namespace, name } = this.resolveName(rawType, currentNamespace);
    const key = `${namespace}.${name}`;
    if (seen.has(key)) {
      throw new Error(`Circular typedef detected for ${key}`);
    }
    seen.add(key);

    const meta = this.byNamespace.get(namespace);
    if (!meta) {
      return { kind: "primitive", type: rawType };
    }

    const typedef = meta.ast.typedef?.[name];
    if (typedef) {
      return this.resolveType(typedef.type, namespace, seen);
    }

    if (meta.ast.enum?.[name]) {
      return { kind: "enum", namespace, name };
    }
    if (meta.ast.struct?.[name]) {
      return { kind: "struct", namespace, name, fields: meta.ast.struct[name] };
    }
    if (meta.ast.union?.[name]) {
      return { kind: "union", namespace, name, fields: meta.ast.union[name] };
    }
    if (meta.ast.exception?.[name]) {
      return { kind: "exception", namespace, name, fields: meta.ast.exception[name] };
    }

    return { kind: "primitive", type: rawType };
  }

  resolveName(typeName: string, currentNamespace: string): { namespace: string; name: string } {
    if (!typeName.includes(".")) {
      return { namespace: currentNamespace, name: typeName };
    }
    const [prefix, actualName] = typeName.split(".", 2);
    const currentMeta = this.byNamespace.get(currentNamespace);
    const include = currentMeta?.ast.include?.[prefix];
    if (include) {
      const relativePath = new URL(
        include.path,
        `https://thrift.invalid/${currentMeta!.path}`,
      ).pathname.slice(1);
      const targetMeta =
        this.byPath.get(relativePath) ??
        this.byPath.get(include.path) ??
        this.byNamespace.get(prefix);
      if (targetMeta) {
        return { namespace: targetMeta.name, name: actualName };
      }
    }
    return { namespace: prefix, name: actualName };
  }

  findService(
    serviceName: string,
    preferredNamespace?: string,
  ): { namespace: string; service: Service } | undefined {
    if (preferredNamespace) {
      const meta = this.byNamespace.get(preferredNamespace);
      if (meta?.ast.service?.[serviceName]) {
        return { namespace: preferredNamespace, service: meta.ast.service[serviceName]! };
      }
    }
    for (const [ns, meta] of this.byNamespace.entries()) {
      if (meta.ast.service?.[serviceName]) {
        return { namespace: ns, service: meta.ast.service[serviceName]! };
      }
    }
    return undefined;
  }

  getMethod(
    namespace: string,
    serviceName: string,
    methodName: string,
    seen = new Set<string>(),
  ): { method: Method; namespace: string } | undefined {
    const key = `${namespace}.${serviceName}`;
    if (seen.has(key)) {
      return undefined;
    }
    seen.add(key);

    const meta = this.byNamespace.get(namespace);
    if (!meta) {
      return undefined;
    }

    const service = meta.ast.service?.[serviceName];
    if (!service) {
      return undefined;
    }

    const method = service.functions?.[methodName];
    if (method) {
      return { method, namespace };
    }

    if (service.extends) {
      const parent = this.resolveName(service.extends, namespace);
      return this.getMethod(parent.namespace, parent.name, methodName, seen);
    }

    return undefined;
  }
}
