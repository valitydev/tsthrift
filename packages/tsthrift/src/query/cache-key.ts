import { binaryToString, isBinary } from "../runtime/binary-converter.ts";

/**
 * Deterministically normalizes arbitrary values (including bigint, Map, Set, Uint8Array)
 * into JSON-safe, deterministic structures suitable for TanStack Query keys.
 */
export function normalizeCacheKey(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return `${value.toString()}n`;
  if (isBinary(value)) return `binary:${binaryToString(value, "hex")}`;
  if (value instanceof Date) return value.toISOString();

  if (value instanceof Set) {
    const items = Array.from(value).map(normalizeCacheKey);
    return items.sort((a, b) => String(a).localeCompare(String(b)));
  }

  if (value instanceof Map) {
    const entries = Array.from(value.entries()).map(([k, v]) => [
      normalizeCacheKey(k),
      normalizeCacheKey(v),
    ]);
    return entries.sort(([a], [b]) => String(a).localeCompare(String(b)));
  }

  if (Array.isArray(value)) {
    return value.map(normalizeCacheKey);
  }

  if (typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = normalizeCacheKey((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }

  return value;
}

/**
 * Builds a deterministic query key for a Thrift service RPC method call.
 */
export function createThriftQueryKey(
  serviceName: string,
  methodName: string,
  args: unknown[] = [],
  scope?: Record<string, unknown>,
): unknown[] {
  const normalizedArgs = args.map(normalizeCacheKey);
  const key: unknown[] = [serviceName, methodName, ...normalizedArgs];
  if (scope && Object.keys(scope).length > 0) {
    key.push(normalizeCacheKey(scope));
  }
  return key;
}
