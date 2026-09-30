import type { Program } from "./load-schema.ts";
import { enumMembers } from "./enum-members.ts";

export function referenceName(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || !("=" in value)) return undefined;
  const parts: unknown = value["="];
  if (!Array.isArray(parts) || !parts.every((part) => typeof part === "string")) return undefined;
  return parts.join(".");
}

export function constantReference(
  scope: Program,
  name: string,
): { scope: Program; value: unknown; identity: string } {
  const parts = name.split(".");
  const included = scope.includes.get(parts[0]!);
  if (included) {
    scope = included;
    parts.shift();
  }
  if (parts.length === 1 && Object.hasOwn(scope.ast.const ?? {}, parts[0]!)) {
    const constant = scope.ast.const![parts[0]!]!;
    return { scope, value: constant.value, identity: `${scope.path}:${parts[0]}` };
  }
  if (parts.length === 2 && Object.hasOwn(scope.ast.enum ?? {}, parts[0]!)) {
    const member = enumMembers(scope.ast.enum![parts[0]!]!, `${scope.path}:${parts[0]}`).find(
      (item) => item.name === parts[1],
    );
    if (member) return { scope, value: member.value, identity: `${scope.path}:${name}` };
  }
  throw new Error(`Unresolved constant reference ${name} in ${scope.path}`);
}
