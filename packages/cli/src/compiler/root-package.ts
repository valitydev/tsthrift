import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export interface RootPackageInfo {
  name?: string;
  version?: string;
  license?: string;
}

/**
 * Searches for root package.json to inherit name, version, and license for generated packages.
 */
export async function findRootPackageInfo(options: {
  rootPackageJson?: string;
  input?: string;
  output?: string;
}): Promise<RootPackageInfo | null> {
  if (options.rootPackageJson) {
    return tryReadPackageJson(options.rootPackageJson);
  }

  const searchStarts = [options.output, options.input].filter(Boolean) as string[];
  for (const start of searchStarts) {
    const found = await searchUpwards(path.resolve(start));
    if (found) {
      return found;
    }
  }

  return tryReadPackageJson(path.join(process.cwd(), "package.json"));
}

async function searchUpwards(startPath: string): Promise<RootPackageInfo | null> {
  let current = startPath;
  try {
    const stats = await stat(current);
    if (!stats.isDirectory()) {
      current = path.dirname(current);
    }
  } catch {
    current = path.dirname(current);
  }

  while (true) {
    const candidate = path.join(current, "package.json");
    const info = await tryReadPackageJson(candidate);
    if (info) {
      return info;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return null;
}

async function tryReadPackageJson(targetPath: string): Promise<RootPackageInfo | null> {
  try {
    const stats = await stat(targetPath);
    const filePath = stats.isDirectory() ? path.join(targetPath, "package.json") : targetPath;
    const content = await readFile(filePath, "utf8");
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return {
      name: typeof parsed.name === "string" ? parsed.name : undefined,
      version: typeof parsed.version === "string" ? parsed.version : undefined,
      license: typeof parsed.license === "string" ? parsed.license : undefined,
    };
  } catch {
    return null;
  }
}
