import { MetadataIndex } from "./index.ts";
import type { Field, I64Mode } from "./types.ts";
import {
  createRpcClient,
  type MethodCodec,
  type RpcClientConfig,
} from "../transport/rpc-client.ts";
import { struct } from "../codecs/struct.ts";
import type { MetadataSource } from "../transport/types.ts";
import { MetadataCodecs } from "./codecs.ts";

export interface MetadataClientConfig extends RpcClientConfig {
  metadata?: MetadataSource;
  index?: MetadataIndex;
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
  let index = config.index;
  if (!index) {
    if (!config.metadata) throw new TypeError("Expected metadata or index in config");
    const loaded = await (typeof config.metadata === "function"
      ? config.metadata()
      : config.metadata);
    const metadata = Array.isArray(loaded) ? loaded : loaded.default;
    if (!Array.isArray(metadata)) throw new TypeError("Expected metadata array");
    index = new MetadataIndex(structuredClone(metadata));
  }
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
  return createRpcClient<T>(methods, config, config.serviceName, config.namespace);
}

/**
 * Creates a synchronous proxy client that lazily initializes metadata and codecs
 * on the first RPC method invocation. Ideal for dependency injection (e.g. Angular).
 */
export function createLazyMetadataClient<T extends object = DynamicThriftClient>(
  config: MetadataClientConfig,
): T {
  let clientPromise: Promise<T> | undefined;
  const getClient = () => {
    if (!clientPromise) clientPromise = createMetadataClient<T>(config);
    return clientPromise;
  };
  return new Proxy(Object.create(null) as T, {
    get(_target, prop: string | symbol) {
      if (typeof prop !== "string" || prop === "then") return undefined;
      return async (...args: unknown[]) => {
        const client = await getClient();
        const method = (client as Record<string, unknown>)[prop];
        if (typeof method !== "function") {
          throw new TypeError(
            `Method ${prop} not found on client for service ${config.serviceName}`,
          );
        }
        return method.apply(client, args);
      };
    },
  });
}
