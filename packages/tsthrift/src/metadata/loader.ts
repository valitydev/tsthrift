import type { Metadata } from "./types.ts";

export type MetadataImportModule =
  | Metadata
  | Metadata[]
  | { default: Metadata | Metadata[] }
  | { metadata: Metadata | Metadata[] }
  | { thriftMetadata: Metadata }
  | { loadThriftMetadata: (namespace: string) => Promise<Metadata[]> };
export type MetadataLoaderFn = () => Promise<MetadataImportModule | MetadataImportModule[]>;

export interface MetadataLoaderOptions {
  cache?: Map<string, Promise<Metadata[]>>;
}

async function unwrapModule(module: MetadataImportModule, namespace: string): Promise<Metadata[]> {
  if (Array.isArray(module)) return module;
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

/** Caches successful loads and allows retry after a rejected load. */
export function createMetadataLoader(
  loaders: Record<string, MetadataLoaderFn>,
  options?: MetadataLoaderOptions,
): (namespace: string) => Promise<Metadata[]> {
  const cache = options?.cache ?? new Map<string, Promise<Metadata[]>>();
  return (namespace) => {
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
}

/** Resolves a generated namespace's dependency closure through the shared loader. */
export function createNamespaceLoader(
  dependencies: Record<string, MetadataLoaderFn>,
): () => Promise<Metadata[]> {
  const load = createMetadataLoader(dependencies);
  let pending: Promise<Metadata[]> | undefined;
  return () =>
    (pending ??= Promise.all(Object.keys(dependencies).map(load))
      .then((groups) => {
        const modules = new Map<string, Metadata>();
        for (const metadata of groups.flat()) modules.set(metadata.name, metadata);
        return [...modules.values()];
      })
      .catch((error: unknown) => {
        pending = undefined;
        throw error;
      }));
}
