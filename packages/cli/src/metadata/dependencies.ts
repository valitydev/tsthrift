import type { Program } from "../compiler/load-schema.ts";

/**
 * Returns the unique transitive dependencies of a program in deterministic order.
 * The target program is always first, followed by its reachable includes.
 */
export function getTransitiveDependencies(program: Program): Program[] {
  const visited = new Set<string>();
  const result: Program[] = [];

  function visit(p: Program) {
    if (visited.has(p.name)) return;
    visited.add(p.name);
    result.push(p);
    for (const dep of p.includes.values()) {
      visit(dep);
    }
  }

  visit(program);
  return result;
}
