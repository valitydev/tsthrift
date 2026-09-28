import type { HeaderProvider } from "./types.ts";

/** Applies HTTP overrides case-insensitively while preserving provider key spelling. */
export function mergeHeaders(
  ...sources: (Record<string, string> | undefined)[]
): Record<string, string> {
  const result: Record<string, string> = {};
  const keys = new Map<string, string>();
  for (const source of sources) {
    for (const [name, value] of Object.entries(source ?? {})) {
      const previous = keys.get(name.toLowerCase());
      if (previous) delete result[previous];
      Object.defineProperty(result, name, { value, enumerable: true, configurable: true });
      keys.set(name.toLowerCase(), name);
    }
  }
  return result;
}

export async function resolveHeaders(
  provider?: HeaderProvider,
  base: Record<string, string> = {},
): Promise<Record<string, string>> {
  return mergeHeaders(base, typeof provider === "function" ? await provider(base) : provider);
}

/** Resolves providers in order; each provider receives the accumulated headers. */
export function mergeHeaderProviders(
  base?: HeaderProvider,
  extra?: HeaderProvider,
): HeaderProvider | undefined {
  if (!base) return extra;
  if (!extra) return base;
  return async (initial: Record<string, string> = {}) =>
    resolveHeaders(extra, await resolveHeaders(base, initial));
}
