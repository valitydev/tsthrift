/**
 * Standard HTTP header names used in the Woody RPC protocol (Erlang, Java, JS).
 */
export const WOODY_HEADERS = {
  TRACE_ID: "x-woody-trace-id",
  SPAN_ID: "x-woody-span-id",
  PARENT_ID: "x-woody-parent-id",
  DEADLINE: "x-woody-deadline",
  FLAGS: "x-woody-flags",
  META_PREFIX: "x-woody-meta-",
} as const;

export type WoodyMetaScalar = string | number | boolean;
export type WoodyMetaValue = WoodyMetaScalar | null | undefined;

export interface WoodyMetaMap {
  [key: string]: WoodyMetaValue | WoodyMetaMap;
}

export type WoodyMetaProvider = WoodyMetaMap | (() => WoodyMetaMap | Promise<WoodyMetaMap>);

/**
 * Configuration options for generating Woody RPC tracing headers.
 */
export interface WoodyHeadersConfig {
  /** Trace ID or generator function. Defaults to a base64-encoded Flake ID. */
  traceId?: string | (() => string);
  /** Span ID or generator function. Defaults to traceId if omitted. */
  spanId?: string | (() => string);
  /** Parent span ID for hierarchical tracing. */
  parentId?: string;
  /** Woody flags bitmask (e.g. 0 or 1). */
  flags?: number | string;
  /** Absolute deadline (Date, epoch timestamp in ms, or RFC3339 string). */
  deadline?: Date | number | string;
  /** Base prefix for standard Woody headers (defaults to 'x-woody-'). */
  prefix?: string;
  /** Prefix for metadata headers. Defaults to '${prefix}meta-' (e.g. 'x-woody-meta-'). */
  metaPrefix?: string;
  /** Custom woody metadata (values prefixed with metaPrefix). Supports nested maps and async factories. */
  meta?: WoodyMetaProvider;
}

import { generateTraceId } from "./generate-id.ts";

export { BASE64_ALPHABET, FlakeId, bs64, generateId, generateTraceId } from "./generate-id.ts";
export type { FlakeIdOptions } from "./generate-id.ts";

/**
 * Flattens a nested metadata map into prefixed header entries, skipping null and undefined values.
 */
export function flattenMeta(
  map: WoodyMetaMap,
  prefix: string,
  out: Record<string, string> = {},
): Record<string, string> {
  for (const [key, value] of Object.entries(map)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "object") {
      flattenMeta(value as WoodyMetaMap, `${prefix}${key}-`, out);
    } else {
      out[`${prefix}${key}`] = String(value);
    }
  }
  return out;
}

/**
 * Creates a record of Woody HTTP headers safe for browser fetch and Node.js.
 */
export function createWoodyHeaders(
  config?: Omit<WoodyHeadersConfig, "meta"> & { meta?: WoodyMetaMap | (() => WoodyMetaMap) },
): Record<string, string> {
  const headers: Record<string, string> = {};
  const prefix = config?.prefix ?? "x-woody-";
  const metaPrefix = config?.metaPrefix ?? `${prefix}meta-`;

  const traceId =
    typeof config?.traceId === "function"
      ? config.traceId()
      : (config?.traceId ?? generateTraceId());

  headers[`${prefix}trace-id`] = traceId;

  const spanId =
    typeof config?.spanId === "function" ? config.spanId() : (config?.spanId ?? traceId);

  headers[`${prefix}span-id`] = spanId;

  if (config?.parentId) {
    headers[`${prefix}parent-id`] = config.parentId;
  }

  if (config?.flags !== undefined && config.flags !== null) {
    headers[`${prefix}flags`] = String(config.flags);
  }

  if (config?.deadline !== undefined && config.deadline !== null) {
    if (config.deadline instanceof Date) {
      headers[`${prefix}deadline`] = config.deadline.toISOString();
    } else if (typeof config.deadline === "number") {
      headers[`${prefix}deadline`] = new Date(config.deadline).toISOString();
    } else {
      headers[`${prefix}deadline`] = String(config.deadline);
    }
  }

  if (config?.meta) {
    if (typeof config.meta === "function") {
      const result = config.meta();
      if (result && typeof result === "object" && !("then" in result)) {
        flattenMeta(result as WoodyMetaMap, metaPrefix, headers);
      }
    } else if (typeof config.meta === "object") {
      flattenMeta(config.meta, metaPrefix, headers);
    }
  }

  return headers;
}

/**
 * Asynchronously resolves Woody headers, supporting async meta providers.
 */
export async function resolveWoodyHeaders(
  config?: WoodyHeadersConfig,
): Promise<Record<string, string>> {
  const meta = typeof config?.meta === "function" ? await config.meta() : config?.meta;
  return createWoodyHeaders({ ...config, meta });
}

/**
 * Creates a HeaderProvider function that injects Woody headers into outgoing requests.
 */
export function createWoodyHeaderProvider(
  config?: WoodyHeadersConfig,
): (baseHeaders?: Record<string, string>) => Promise<Record<string, string>> {
  return async (baseHeaders = {}) => {
    const woody = await resolveWoodyHeaders(config);
    return {
      ...woody,
      ...baseHeaders,
    };
  };
}
