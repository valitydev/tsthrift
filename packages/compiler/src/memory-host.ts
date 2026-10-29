import type { ExternalResolver, SchemaHost } from "./build-schema.ts";
import { dirnamePath, joinPath, normalizePath, relativeWithin } from "./posix-path.ts";

/** Source documents keyed by file path; include paths resolve between these keys. */
export type SourceFiles = Readonly<Record<string, string>> | ReadonlyMap<string, string>;

export interface MemoryHostOptions {
  /** Directories searched for includes after the importing file's directory. */
  includeRoots?: readonly string[];
  warn?: (message: string) => void;
  external?: ExternalResolver;
}

/** Reads the include graph from in-memory sources using POSIX paths. */
export function createMemoryHost(
  sources: SourceFiles,
  entries: readonly string[],
  options: MemoryHostOptions = {},
): SchemaHost {
  const files = new Map<string, string>();
  const documents = sources instanceof Map ? sources.entries() : Object.entries(sources);
  for (const [path, text] of documents) files.set(normalizePath(path), text);
  const searchRoots = [
    ...new Set([
      ...entries.map((entry) => dirnamePath(entry)),
      ...(options.includeRoots ?? []).map((root) => normalizePath(root)),
    ]),
  ];
  return {
    canonical: (filename) => normalizePath(filename),
    read(filename) {
      const text = files.get(filename);
      if (text === undefined) throw new Error(`Source not found: ${filename}`);
      return text;
    },
    resolveInclude(includePath, from) {
      for (const directory of [dirnamePath(from), ...searchRoots]) {
        const candidate = joinPath(directory, includePath);
        if (files.has(candidate)) return candidate;
      }
      return undefined;
    },
    modulePath(filename) {
      for (const root of searchRoots) {
        const relative = relativeWithin(root, filename);
        if (relative !== undefined) return relative;
      }
      return filename.slice(filename.lastIndexOf("/") + 1);
    },
    warn: options.warn,
    external: options.external,
  };
}
