import { THRIFT_METHOD_ARGUMENT_COUNT } from "../transport/method-arguments.ts";
import {
  type DynamicThriftClient,
  type MetadataClientConfig,
  createMetadataClient,
} from "./client.ts";

/**
 * Creates a synchronous client that lazily initializes metadata and codecs
 * on the first RPC method invocation. Only the listed methods are exposed.
 */
export function createLazyMetadataClient<T extends object = DynamicThriftClient>(
  config: MetadataClientConfig,
  methodNames: readonly string[],
): T {
  if (!config) throw new TypeError("Expected metadata client configuration");
  let clientPromise: Promise<T> | undefined;
  const getClient = () => {
    if (!clientPromise)
      clientPromise = createMetadataClient<T>(config).catch((error: unknown) => {
        clientPromise = undefined;
        throw error;
      });
    return clientPromise;
  };
  const createMethod = (name: string) => {
    const getMethod = async () => {
      const underlying = await getClient();
      const method = (underlying as Record<string, unknown>)[name];
      if (typeof method !== "function")
        throw new TypeError(`Method ${name} not found on client for service ${config.serviceName}`);
      return method;
    };
    const call = async (...args: unknown[]) => (await getMethod())(...args);
    Object.defineProperty(call, THRIFT_METHOD_ARGUMENT_COUNT, {
      get: () =>
        getMethod().then(
          (method) =>
            (method as { [THRIFT_METHOD_ARGUMENT_COUNT]?: number })[THRIFT_METHOD_ARGUMENT_COUNT],
        ),
    });
    return call;
  };
  const client = Object.fromEntries(methodNames.map((name) => [name, createMethod(name)])) as T;
  return client;
}
