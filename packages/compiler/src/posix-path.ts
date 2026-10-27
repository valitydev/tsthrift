/** Minimal POSIX path helpers; the compiler core cannot import `node:path`. */

/** Collapses `.`, `..`, repeated separators, and backslashes. */
export function normalizePath(value: string): string {
  const text = value.replaceAll("\\", "/");
  const absolute = text.startsWith("/");
  const segments: string[] = [];
  for (const segment of text.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length && segments.at(-1) !== "..") segments.pop();
      else if (!absolute) segments.push("..");
      continue;
    }
    segments.push(segment);
  }
  const joined = segments.join("/");
  return absolute ? `/${joined}` : joined || ".";
}

export function dirnamePath(value: string): string {
  const normalized = normalizePath(value);
  const index = normalized.lastIndexOf("/");
  if (index < 0) return ".";
  return index === 0 ? "/" : normalized.slice(0, index);
}

export function joinPath(directory: string, value: string): string {
  return normalizePath(value.startsWith("/") ? value : `${directory}/${value}`);
}

/** The path of `file` below `root` when `file` is inside it. */
export function relativeWithin(root: string, file: string): string | undefined {
  const base = normalizePath(root);
  const target = normalizePath(file);
  if (base === ".") return target.startsWith("..") || target.startsWith("/") ? undefined : target;
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return target.startsWith(prefix) ? target.slice(prefix.length) : undefined;
}

/** The module name of a `.thrift` file or include path: its basename without the extension. */
export function moduleName(file: string): string {
  const name = file.split(/[\\/]/).pop() ?? file;
  return name.endsWith(".thrift") ? name.slice(0, -".thrift".length) : name;
}
