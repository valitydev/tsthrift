import { parseThrift } from "./parse.ts";
import { moduleName } from "./posix-path.ts";
import type { Program, Schema } from "./schema.ts";
import type { ThriftAst } from "@vality/tsthrift";

export type MaybePromise<T> = T | Promise<T>;

/** A module provided by something other than a local `.thrift` file, such as a protocol package. */
export interface ExternalReference {
  /** Identity of the source; a source is loaded once. */
  key: string;
  load(): MaybePromise<{ program: Program; moduleNames: string[] }>;
}

export interface ExternalResolver {
  /** An explicitly configured external module; it takes precedence over local files. */
  configured(name: string): MaybePromise<ExternalReference | undefined>;
  /** A module found only after local lookup of an include failed. */
  discover?(name: string): MaybePromise<ExternalReference | undefined>;
  /** Configured and discovered module names; each must be reachable from the inputs. */
  names(): Iterable<string>;
  /** Sources searched by `discover`, named in missing-include errors. */
  searched?: readonly string[];
}

/** The environment the include graph is read from: a file system, an in-memory map, and so on. */
export interface SchemaHost {
  /** Identity of a file, for example its real path. */
  canonical(filename: string): MaybePromise<string>;
  read(filename: string): MaybePromise<string>;
  /** Looks for an include next to the importing file, then in the search roots. */
  resolveInclude(includePath: string, from: string): MaybePromise<string | undefined>;
  /** `Program.path` of a canonical file: a POSIX path below its search root. */
  modulePath(filename: string): string;
  warn?(message: string): void;
  external?: ExternalResolver;
}

export interface BuildSchemaOptions {
  /** Shadow a repeated module name with the first module instead of failing. */
  allowDuplicateModules?: boolean;
}

/** Builds the include graph reachable from `roots`; each root is a module to compile. */
export async function buildSchema(
  roots: readonly string[],
  host: SchemaHost,
  options: BuildSchemaOptions = {},
): Promise<Schema> {
  const external = host.external;
  const programs = new Map<string, Program>();
  const packageModules = new Set<string>();
  const filenames = new Map<string, string>();
  const visiting = new Set<string>();

  const canonicalRoots: string[] = [];
  for (const root of roots) {
    const filename = await host.canonical(root);
    const rootName = moduleName(filename);
    if (await external?.configured(rootName)) {
      throw new Error(
        `Cannot mark module "${rootName}" as external because it is one of the local compilation roots`,
      );
    }
    canonicalRoots.push(filename);
  }

  async function loadExternal(name: string, reference: ExternalReference): Promise<Program> {
    const previous = programs.get(reference.key);
    if (previous) return previous;
    const conflict = filenames.get(name);
    if (conflict)
      throw new Error(`Duplicate module name ${name}: ${conflict} and ${reference.key}`);
    const { program, moduleNames } = await reference.load();
    for (const moduleName of moduleNames) packageModules.add(moduleName);
    filenames.set(name, reference.key);
    programs.set(reference.key, program);
    return program;
  }

  async function visit(file: string): Promise<Program> {
    const filename = await host.canonical(file);
    if (visiting.has(filename)) throw new Error(`Circular include: ${filename}`);
    const previous = programs.get(filename);
    if (previous) return previous;
    const name = moduleName(filename);
    if (!/^[A-Za-z_][\w]*$/.test(name)) throw new Error(`Unsupported module name: ${filename}`);
    const conflict = filenames.get(name);
    if (conflict) {
      if (options.allowDuplicateModules) {
        if (visiting.has(conflict)) throw new Error(`Circular include: ${filename}`);
        const existing = programs.get(conflict);
        if (existing) {
          host.warn?.(`[WARN] Module "${name}" in ${filename} is shadowed by ${conflict}`);
          return existing;
        }
      }
      throw new Error(`Duplicate module name ${name}: ${conflict} and ${filename}`);
    }
    filenames.set(name, filename);
    let ast: ThriftAst;
    try {
      ast = parseThrift(await host.read(filename));
    } catch (cause) {
      throw new Error(`Cannot parse ${filename}: ${String(cause)}`, { cause });
    }
    const program: Program = {
      filename,
      name,
      path: host.modulePath(filename),
      ast,
      includes: new Map(),
    };
    programs.set(filename, program);
    visiting.add(filename);
    for (const [alias, include] of Object.entries(ast.include ?? {})) {
      const includeName = moduleName(include.path);
      const configured = await external?.configured(includeName);
      if (configured) {
        // Explicit external modules always come from their own metadata, never from local files.
        program.includes.set(alias, await loadExternal(includeName, configured));
        continue;
      }
      const resolved = await host.resolveInclude(include.path, filename);
      if (!resolved) {
        const discovered = await external?.discover?.(includeName);
        if (!discovered) {
          const searched = external?.searched?.length
            ? ` (also not provided by external packages: ${external.searched.join(", ")})`
            : "";
          throw new Error(`Missing include ${include.path} in ${filename}${searched}`);
        }
        program.includes.set(alias, await loadExternal(includeName, discovered));
        continue;
      }
      program.includes.set(alias, await visit(resolved));
    }
    visiting.delete(filename);
    return program;
  }

  const rootPrograms: Program[] = [];
  for (const file of canonicalRoots) rootPrograms.push(await visit(file));
  rootPrograms.sort((a, b) => a.name.localeCompare(b.name));
  const allPrograms = [...programs.values()].sort((a, b) => a.path.localeCompare(b.path));
  for (const name of external?.names() ?? []) {
    if (!packageModules.has(name) && !allPrograms.some((program) => program.name === name)) {
      throw new Error(`External namespace "${name}" is not reachable from the inputs`);
    }
  }
  return {
    roots: rootPrograms,
    programs: allPrograms,
    localPrograms: allPrograms.filter((program) => !program.external),
    externalPrograms: allPrograms.filter((program) => Boolean(program.external)),
  };
}
