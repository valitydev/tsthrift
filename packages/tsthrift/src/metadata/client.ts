import { MetadataIndex } from "../converter/metadata-index.ts";
import type { Field, I64Mode } from "../converter/types.ts";
import { createNativeClient, type MethodCodec, type NativeClientConfig } from "../native/client.ts";
import { struct } from "../native/struct.ts";
import type { MetadataSource } from "../transport/types.ts";
import { MetadataCodecs } from "./codecs.ts";

export interface MetadataClientConfig extends NativeClientConfig {
  metadata: MetadataSource;
  namespace: string;
  serviceName: string;
  i64Mode?: I64Mode;
}

export type DynamicThriftClient = Record<string, (...args: unknown[]) => Promise<unknown>>;

/** Builds a client entirely from metadata, without generated modules or eval. */
export async function createMetadataClient<T extends object = DynamicThriftClient>(
  config: MetadataClientConfig,
): Promise<T> {
  const mode = config.i64Mode ?? "bigint";
  if (mode !== "bigint" && mode !== "number") throw new Error("Unknown i64 mode");
  const loaded = await (typeof config.metadata === "function"
    ? config.metadata()
    : config.metadata);
  const metadata = Array.isArray(loaded) ? loaded : loaded.default;
  if (!Array.isArray(metadata)) throw new TypeError("Expected metadata array");
  const index = new MetadataIndex(structuredClone(metadata));
  const codecs = new MetadataCodecs(index, mode);
  const methods: Record<string, MethodCodec> = Object.create(null);
  const visited = new Set<string>();
  const addService = (namespace: string, name: string) => {
    const key = `${namespace}.${name}`;
    if (visited.has(key)) throw new Error(`Circular service inheritance: ${key}`);
    visited.add(key);
    const service = index.getMetadata(namespace)?.ast.service?.[name];
    if (!service) throw new Error(`Unknown metadata service ${key}`);
    if (service.extends) {
      const parent = index.resolveName(service.extends, namespace);
      addService(parent.namespace, parent.name);
    }
    for (const method of Object.values(service.functions)) {
      if (method.name === "then")
        throw new Error("A metadata client cannot expose the Promise-reserved method then");
      if (method.oneway && (method.type !== "void" || method.throws.length))
        throw new Error(`Invalid oneway method ${key}.${method.name}`);
      if (method.throws.some((field) => field.id === 0 || field.name === "success"))
        throw new Error(`Exception collides with result field: ${key}.${method.name}`);
      const result: Field[] =
        method.type === "void" ? [] : [{ id: 0, name: "success", type: method.type }];
      result.push(
        ...method.throws.map((field) => ({
          ...field,
          option: "optional" as const,
          defaultValue: undefined,
        })),
      );
      const args = codecs.fields(method.args, namespace);
      const reply = codecs.fields(result, namespace);
      methods[method.name] = {
        args: struct(`${key}.${method.name}.args`, () => args),
        argumentNames: method.args.map((field) => field.name),
        result: struct(`${key}.${method.name}.result`, () => reply),
        exceptions: method.throws.map((field) => field.name),
        returns: method.type !== "void",
        oneway: method.oneway,
      };
    }
  };
  addService(config.namespace, config.serviceName);
  return createNativeClient<T>(methods, config, config.serviceName, config.namespace);
}
