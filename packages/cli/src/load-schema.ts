import { glob, lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { buildSchema } from "@vality/tsthrift-compiler";
import type {
  ExternalNamespaceConfig,
  ExternalReference,
  Schema,
  SchemaHost,
} from "@vality/tsthrift-compiler";
import { loadPackageProgram } from "./load-package-program.ts";
import { resolveFromPackage } from "./resolve-package.ts";
import { resolveExternalMetadata } from "./resolve-external-metadata.ts";

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
  externalNamespaces?: Map<string, ExternalNamespaceConfig>,
  packageRoot: string = process.cwd(),
  externalPackages: string[] = [],
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
  const namespaces = externalNamespaces ?? new Map<string, ExternalNamespaceConfig>();

  const reference = (name: string, config: ExternalNamespaceConfig): ExternalReference => ({
    key: `package:${config.importPath}`,
    load: () => loadPackageProgram(name, config, packageRoot),
  });

  /**
   * Finds the module in the `--external <package>` packages by basename, so the directory part of
   * the include path (for example `proto/`) does not matter.
   */
  async function findPackageModule(name: string): Promise<ExternalReference | undefined> {
    for (const pkg of externalPackages) {
      const importPath = `${pkg}/${name}`;
      const config = await resolveExternalMetadata({ importPath, package: pkg }, packageRoot);
      try {
        await resolveFromPackage(config.metadataPath ?? importPath, packageRoot);
      } catch {
        continue;
      }
      namespaces.set(name, config);
      return reference(name, config);
    }
    return undefined;
  }

  const host: SchemaHost = {
    canonical: (filename) => realpath(filename),
    read: (filename) => readFile(filename, "utf8"),
    async resolveInclude(includePath, from) {
      for (const directory of [path.dirname(from), ...searchRoots]) {
        try {
          return await realpath(path.resolve(directory, includePath));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      return undefined;
    },
    modulePath: (filename) =>
      path
        .relative(
          searchRoots.find((directory) => {
            const relative = path.relative(directory, filename);
            return !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
          }) ?? path.dirname(filename),
          filename,
        )
        .split(path.sep)
        .join("/"),
    warn: (message) => console.warn(message),
    external: {
      configured(name) {
        const config = namespaces.get(name);
        return config && reference(name, config);
      },
      discover: findPackageModule,
      names: () => namespaces.keys(),
      searched: externalPackages,
    },
  };
  return buildSchema(inputFiles, host, { allowDuplicateModules });
}
