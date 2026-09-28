import { glob, lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import parse from "thrift-parser";
import type { Metadata, ThriftAst } from "@vality/tsthrift";

export interface Program extends Metadata {
  filename: string;
  includes: Map<string, Program>;
}

export interface Schema {
  roots: Program[];
  programs: Program[];
}

async function resolveInputFiles(input: string | string[]): Promise<string[]> {
  const patterns = Array.isArray(input) ? input : [input];
  const matched = new Set<string>();

  for (const pattern of patterns) {
    let stat;
    try {
      stat = await lstat(pattern);
    } catch {
      // not a direct file/directory path as-is, treat as glob
    }

    if (stat?.isDirectory()) {
      for await (const file of glob(path.join(pattern, "**", "*.thrift"))) {
        matched.add(await realpath(file));
      }
    } else if (stat?.isFile()) {
      if (pattern.endsWith(".thrift")) {
        matched.add(await realpath(pattern));
      }
    } else {
      let found = false;
      for await (const file of glob(pattern)) {
        if (file.endsWith(".thrift")) {
          matched.add(await realpath(file));
          found = true;
        }
      }
      if (!found && !pattern.includes("*") && !pattern.includes("?")) {
        throw new Error(`Input file not found: ${pattern}`);
      }
    }
  }

  const files = [...matched].sort();
  if (!files.length) {
    const display = Array.isArray(input) ? input.join(", ") : input;
    throw new Error(`No Thrift inputs found for: ${display}`);
  }
  return files;
}

export async function loadSchema(
  input: string | string[],
  includeRoots: string[] = [],
  allowDuplicateModules?: boolean,
): Promise<Schema> {
  const inputFiles = await resolveInputFiles(input);
  const explicitDirs: string[] = [];
  for (const p of Array.isArray(input) ? input : [input]) {
    try {
      const s = await lstat(p);
      if (s.isDirectory()) explicitDirs.push(await realpath(p));
    } catch {}
  }

  const searchRoots = [
    ...new Set([
      ...explicitDirs,
      ...inputFiles.map((file) => path.dirname(file)),
      ...(await Promise.all(includeRoots.map((dir) => realpath(dir)))),
    ]),
  ];
  const programs = new Map<string, Program>();
  const filenames = new Map<string, string>();
  const visiting = new Set<string>();

  async function visit(filename: string): Promise<Program> {
    filename = await realpath(filename);
    if (visiting.has(filename)) throw new Error(`Circular include: ${filename}`);
    const previous = programs.get(filename);
    if (previous) return previous;
    const name = path.basename(filename, ".thrift");
    if (!/^[A-Za-z_][\w]*$/.test(name)) throw new Error(`Unsupported module name: ${filename}`);
    const conflict = filenames.get(name);
    if (conflict) {
      if (allowDuplicateModules) {
        if (visiting.has(conflict)) throw new Error(`Circular include: ${filename}`);
        const existing = programs.get(conflict);
        if (existing) {
          console.warn(`[WARN] Module "${name}" in ${filename} is shadowed by ${conflict}`);
          return existing;
        }
      }
      throw new Error(`Duplicate module name ${name}: ${conflict} and ${filename}`);
    }
    filenames.set(name, filename);
    let ast: ThriftAst;
    try {
      ast = parse(await readFile(filename, "utf8")) as unknown as ThriftAst;
    } catch (cause) {
      throw new Error(`Cannot parse ${filename}: ${String(cause)}`, { cause });
    }
    const program: Program = {
      filename,
      name,
      path: path
        .relative(
          searchRoots.find((directory) => {
            const relative = path.relative(directory, filename);
            return !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
          }) ?? path.dirname(filename),
          filename,
        )
        .split(path.sep)
        .join("/"),
      ast,
      includes: new Map(),
    };
    programs.set(filename, program);
    visiting.add(filename);
    for (const [alias, include] of Object.entries(ast.include ?? {})) {
      const candidates = [path.dirname(filename), ...searchRoots].map((dir) =>
        path.resolve(dir, include.path),
      );
      let resolved: string | undefined;
      for (const candidate of candidates) {
        try {
          resolved = await realpath(candidate);
          break;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      if (!resolved) throw new Error(`Missing include ${include.path} in ${filename}`);
      program.includes.set(alias, await visit(resolved));
    }
    visiting.delete(filename);
    return program;
  }

  const roots: Program[] = [];
  for (const file of inputFiles) {
    roots.push(await visit(file));
  }
  roots.sort((a, b) => a.name.localeCompare(b.name));
  return { roots, programs: [...programs.values()].sort((a, b) => a.path.localeCompare(b.path)) };
}
