import type { Metadata } from "./types.ts";

export type MetadataImportModule = Metadata | { default: Metadata } | { metadata: Metadata };
export type MetadataLoaderFn = () => Promise<MetadataImportModule | MetadataImportModule[]>;

export interface MetadataLoaderOptions {
  cache?: Map<string, Promise<Metadata[]>>;
}

/**
 * Creates a cached metadata loader function from a record of module dynamic import loaders.
 */
export function createMetadataLoader(
  loaders: Record<string, MetadataLoaderFn>,
  options?: MetadataLoaderOptions,
): (namespace: string) => Promise<Metadata[]> {
  const cache = options?.cache ?? new Map<string, Promise<Metadata[]>>();

  return function loadMetadata(namespace: string): Promise<Metadata[]> {
    let cached = cache.get(namespace);
    if (!cached) {
      const loader = loaders[namespace];
      if (!loader) {
        return Promise.reject(new Error(`Unknown metadata namespace: ${namespace}`));
      }
      cached = Promise.resolve()
        .then(() => loader())
        .then((res) => {
          const items = Array.isArray(res) ? res : [res];
          return items.map((m: any) => (m?.metadata ?? m?.default ?? m) as Metadata);
        });
      cache.set(namespace, cached);
    }
    return cached;
  };
}
