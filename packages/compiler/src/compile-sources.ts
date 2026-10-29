import type { Metadata } from "@vality/tsthrift";
import type { BinaryMode } from "./binary-mode.ts";
import { buildSchema } from "./build-schema.ts";
import type { ExternalReference } from "./build-schema.ts";
import { emitProject, resolveProjectOptions, validateProject } from "./emit-project.ts";
import type { GeneratedFile, ProjectOptions } from "./emit-project.ts";
import type { I64Mode } from "./i64-mode.ts";
import { createMemoryHost } from "./memory-host.ts";
import type { SourceFiles } from "./memory-host.ts";
import { schemaMetadata } from "./metadata/emit-metadata.ts";
import { normalizePath } from "./posix-path.ts";
import { programsFromMetadata } from "./programs-from-metadata.ts";
import type { Schema } from "./schema.ts";

export interface CompileSourcesOptions extends Omit<ProjectOptions, "models" | "metadataJson"> {
  /** Files to compile; default: every `.thrift` file in the sources. */
  entries?: string[];
  /** Directories searched for includes after the importing file's directory. */
  includeRoots?: string[];
  allowDuplicateModules?: boolean;
  /** Published metadata of modules that are included but not part of the sources. */
  external?: Metadata[];
  /** Also emit the generated TypeScript package into `files`; metadata is always produced. */
  emit?: boolean;
  warn?: (message: string) => void;
}

export interface CompileResult {
  schema: Schema;
  /** Closure of the compiled modules, accepted by `createMetadataClient`. */
  metadata: Metadata[];
  /** `createMetadataClient` options matching the numeric, binary, and method-name modes. */
  client: { i64Mode: I64Mode; binaryMode: BinaryMode; lowerCaseMethods: boolean };
  /** Generated TypeScript package; empty unless `emit` is set. */
  files: GeneratedFile[];
}

/** Compiles in-memory IDL documents into runtime metadata and, optionally, TypeScript sources. */
export async function compileSources(
  sources: SourceFiles,
  options: CompileSourcesOptions = {},
): Promise<CompileResult> {
  const keys = sources instanceof Map ? [...sources.keys()] : Object.keys(sources);
  const entries = (options.entries ?? keys.filter((key) => key.endsWith(".thrift"))).map(
    normalizePath,
  );
  if (!entries.length) throw new Error("No Thrift inputs found in the sources");

  const pool = options.external ?? [];
  const known = new Set(pool.map((item) => item.name));
  const reference = (name: string): ExternalReference | undefined =>
    known.has(name)
      ? {
          key: `metadata:${name}`,
          load: () => programsFromMetadata(name, pool, { importPath: name }, name),
        }
      : undefined;
  const schema = await buildSchema(
    entries,
    createMemoryHost(sources, entries, {
      includeRoots: options.includeRoots,
      warn: options.warn,
      external: pool.length ? { configured: reference, names: () => [] } : undefined,
    }),
    { allowDuplicateModules: options.allowDuplicateModules },
  );

  const project = resolveProjectOptions({ ...options, models: options.emit ?? false });
  validateProject(schema, project);
  const { i64, binary, lowerCaseMethods } = project;
  return {
    schema,
    metadata: schemaMetadata(schema, { i64, lowerCaseMethods, binary }),
    client: { i64Mode: i64, binaryMode: binary, lowerCaseMethods },
    files: options.emit ? emitProject(schema, project) : [],
  };
}
