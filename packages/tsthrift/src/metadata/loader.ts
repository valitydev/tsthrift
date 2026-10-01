import type { Metadata } from "./types.ts";

export type MetadataImportModule<Namespace extends string = string> =
  | Metadata
  | Metadata[]
  | { default: Metadata | Metadata[] }
  | { metadata: Metadata | Metadata[] }
  | { thriftMetadata: Metadata }
  | {
      loadThriftMetadataByNamespaces: (namespace: Namespace) => Promise<Metadata[]>;
    }
  | { loadThriftMetadata: (namespace: Namespace) => Promise<Metadata[]> };
export type MetadataLoaderFn<Namespace extends string = string> = () => Promise<
  MetadataImportModule<Namespace> | MetadataImportModule<Namespace>[]
>;

export interface MetadataLoaderOptions {
  cache?: Map<string, Promise<Metadata[]>>;
}

async function unwrapModule<Namespace extends string>(
  module: MetadataImportModule<Namespace>,
  namespace: Namespace,
): Promise<Metadata[]> {
  if (Array.isArray(module)) return module;
  if ("loadThriftMetadataByNamespaces" in module)
    return module.loadThriftMetadataByNamespaces(namespace);
  if ("loadThriftMetadata" in module) return module.loadThriftMetadata(namespace);
  const metadata =
    "thriftMetadata" in module
      ? module.thriftMetadata
      : "metadata" in module
        ? module.metadata
        : "default" in module
          ? module.default
          : module;
  return Array.isArray(metadata) ? metadata : [metadata];
}

/** Loads selected namespaces, caching successful loads and allowing retries after rejection. */
export function createMetadataLoader<Namespace extends string>(
  loaders: { [Name in Namespace]: MetadataLoaderFn<Name> },
  options?: MetadataLoaderOptions,
): (namespace: Namespace | readonly Namespace[]) => Promise<Metadata[]> {
  const cache = options?.cache ?? new Map<string, Promise<Metadata[]>>();
  const load = (namespace: Namespace): Promise<Metadata[]> => {
    const existing = cache.get(namespace);
    if (existing) return existing;
    if (!Object.hasOwn(loaders, namespace)) {
      return Promise.reject(new Error(`Unknown metadata namespace: ${namespace}`));
    }
    const pending = Promise.resolve()
      .then(() => loaders[namespace]!())
      .then(async (modules) =>
        (
          await Promise.all(
            (Array.isArray(modules) ? modules : [modules]).map((module) =>
              unwrapModule(module, namespace),
            ),
          )
        ).flat(),
      )
      .catch((error: unknown) => {
        if (cache.get(namespace) === pending) cache.delete(namespace);
        throw error;
      });
    cache.set(namespace, pending);
    return pending;
  };
  return (namespaces) => {
    if (typeof namespaces === "string") return load(namespaces);
    const selected: readonly Namespace[] = namespaces;
    if (!Array.isArray(namespaces) || !namespaces.every((name) => typeof name === "string")) {
      return Promise.reject(
        new TypeError("Expected a namespace string or an array of namespace strings"),
      );
    }
    return Promise.all([...new Set(selected)].map(load)).then((groups) => {
      const modules = new Map<string, Metadata>();
      for (const metadata of groups.flat()) modules.set(metadata.name, metadata);
      return [...modules.values()];
    });
  };
}

/** Resolves a generated namespace's dependency closure through the shared loader. */
export function createNamespaceLoader<Namespace extends string>(dependencies: {
  [Name in Namespace]: MetadataLoaderFn<Name>;
}): () => Promise<Metadata[]> {
  const load = createMetadataLoader(dependencies);
  let pending: Promise<Metadata[]> | undefined;
  return () =>
    (pending ??= load(Object.keys(dependencies) as Namespace[]).catch((error: unknown) => {
      pending = undefined;
      throw error;
    }));
}
