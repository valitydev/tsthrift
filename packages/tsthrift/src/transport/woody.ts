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

/**
 * Configuration options for generating Woody RPC tracing headers.
 */
export interface WoodyHeadersConfig {
  /** Trace ID or generator function. Defaults to a random UUID. */
  traceId?: string | (() => string);
  /** Span ID or generator function. Defaults to traceId if omitted. */
  spanId?: string | (() => string);
  /** Parent span ID for hierarchical tracing. */
  parentId?: string;
  /** Woody flags bitmask (e.g. 0 or 1). */
  flags?: number | string;
  /** Absolute deadline (Date, epoch timestamp in ms, or RFC3339 string). */
  deadline?: Date | number | string;
  /** Custom woody metadata (values prefixed with 'x-woody-meta-'). Undefined and null values are omitted. */
  meta?: Record<string, string | number | boolean | undefined | null>;
}

import { generateTraceId } from "./generate-id.ts";

export { BASE64_ALPHABET, FlakeId, bs64, generateId, generateTraceId } from "./generate-id.ts";
export type { FlakeIdOptions } from "./generate-id.ts";

/**
 * Creates a record of Woody HTTP headers safe for browser fetch and Node.js.
 */
export function createWoodyHeaders(config?: WoodyHeadersConfig): Record<string, string> {
  const headers: Record<string, string> = {};

  const traceId =
    typeof config?.traceId === "function"
      ? config.traceId()
      : (config?.traceId ?? generateTraceId());

  headers[WOODY_HEADERS.TRACE_ID] = traceId;

  const spanId =
    typeof config?.spanId === "function" ? config.spanId() : (config?.spanId ?? traceId);

  headers[WOODY_HEADERS.SPAN_ID] = spanId;

  if (config?.parentId) {
    headers[WOODY_HEADERS.PARENT_ID] = config.parentId;
  }

  if (config?.flags !== undefined && config.flags !== null) {
    headers[WOODY_HEADERS.FLAGS] = String(config.flags);
  }

  if (config?.deadline !== undefined && config.deadline !== null) {
    if (config.deadline instanceof Date) {
      headers[WOODY_HEADERS.DEADLINE] = config.deadline.toISOString();
    } else if (typeof config.deadline === "number") {
      headers[WOODY_HEADERS.DEADLINE] = new Date(config.deadline).toISOString();
    } else {
      headers[WOODY_HEADERS.DEADLINE] = String(config.deadline);
    }
  }

  if (config?.meta) {
    for (const [key, value] of Object.entries(config.meta)) {
      if (value !== undefined && value !== null) {
        headers[`${WOODY_HEADERS.META_PREFIX}${key}`] = String(value);
      }
    }
  }

  return headers;
}

/**
 * Creates a HeaderProvider function that injects Woody headers into outgoing requests.
 */
export function createWoodyHeaderProvider(
  config?: WoodyHeadersConfig,
): (baseHeaders?: Record<string, string>) => Record<string, string> {
  return (baseHeaders = {}) => {
    const woody = createWoodyHeaders(config);
    return {
      ...woody,
      ...baseHeaders,
    };
  };
}
