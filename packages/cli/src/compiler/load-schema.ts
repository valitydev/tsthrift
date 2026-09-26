import { readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import parse from "thrift-parser";
import type { Metadata, ThriftAst } from "../metadata/schema.ts";

export interface Program extends Metadata {
  filename: string;
  includes: Map<string, Program>;
}

export interface Schema {
  roots: Program[];
  programs: Program[];
}

export async function loadSchema(
  input: string,
  includeRoots: string[],
  namespaces?: string[],
): Promise<Schema> {
  const root = await realpath(input);
  const searchRoots = [
    root,
    ...(await Promise.all(includeRoots.map((directory) => realpath(directory)))),
  ];
  const entries = await readdir(root, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".thrift"));
  const names = namespaces ?? files.map((file) => path.basename(file.name, ".thrift"));
  if (!names.length) throw new Error(`No Thrift inputs found in ${root}`);
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
    if (conflict) throw new Error(`Duplicate module name ${name}: ${conflict} and ${filename}`);
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
          }) ?? root,
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
  for (const name of [...new Set(names)].sort()) {
    const entry = files.find((file) => file.name === `${name}.thrift`);
    if (!entry) throw new Error(`Unknown input namespace ${name} in ${root}`);
    roots.push(await visit(path.join(root, entry.name)));
  }
  return { roots, programs: [...programs.values()].sort((a, b) => a.path.localeCompare(b.path)) };
}
