import { validateThriftAst } from "./validate-ast.ts";
import type { BinaryMode, Field, Metadata, Method, ValueType } from "./types.ts";

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
  "uuid",
]);

export class MetadataIndex {
  private byNamespace = new Map<string, Metadata>();
  private byPath = new Map<string, Metadata>();

  constructor(metadata: Metadata[] = []) {
    for (const item of metadata) {
      if (
        !item ||
        typeof item.name !== "string" ||
        !item.name ||
        typeof item.path !== "string" ||
        !item.path
      )
        throw new TypeError("Invalid metadata module identity");
      if (item.metadataVersion !== undefined && item.metadataVersion !== 1)
        throw new TypeError("Unsupported metadata version");
      validateThriftAst(item.ast);
      if (this.byNamespace.has(item.name) || this.byPath.has(item.path))
        throw new Error(`Duplicate metadata module: ${item.name} (${item.path})`);
      this.byNamespace.set(item.name, item);
      this.byPath.set(item.path, item);
    }
  }

  validateBuild(
    i64: "bigint" | "number",
    lowerCaseMethods: boolean,
    binary: BinaryMode = "base64",
  ): void {
    for (const item of this.byNamespace.values()) {
      if (
        item.build &&
        (item.build.i64 !== i64 ||
          item.build.lowerCaseMethods !== lowerCaseMethods ||
          (item.build.binary ?? "uint8array") !== binary)
      ) {
        throw new TypeError(`Incompatible generated settings for ${item.name}`);
      }
    }
  }

  getMetadata(namespace: string): Metadata | undefined {
    return this.byNamespace.get(namespace);
  }

  resolveType(
    rawType: ValueType,
    currentNamespace: string,
    seen: Set<string> = new Set<string>(),
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

    const typedef = Object.hasOwn(meta.ast.typedef ?? {}, name)
      ? meta.ast.typedef![name]
      : undefined;
    if (typedef) {
      return this.resolveType(typedef.type, namespace, seen);
    }

    if (Object.hasOwn(meta.ast.enum ?? {}, name)) {
      return { kind: "enum", namespace, name };
    }
    if (Object.hasOwn(meta.ast.struct ?? {}, name)) {
      return { kind: "struct", namespace, name, fields: meta.ast.struct![name]! };
    }
    if (Object.hasOwn(meta.ast.union ?? {}, name)) {
      return { kind: "union", namespace, name, fields: meta.ast.union![name]! };
    }
    if (Object.hasOwn(meta.ast.exception ?? {}, name)) {
      return { kind: "exception", namespace, name, fields: meta.ast.exception![name]! };
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
    throw new Error(`Unknown include ${prefix} in ${currentNamespace}`);
  }

  getMethod(
    namespace: string,
    serviceName: string,
    methodName: string,
    seen: Set<string> = new Set<string>(),
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
