/** Scalar claim value forwarded in HTTP headers. */
export type WachterUserClaimValue = string | number | boolean | null | undefined;

/**
 * User identity information forwarded through Wachter Gateway.
 */
export interface WachterUserIdentity {
  /** Unique user identifier (e.g. subject or account ID). */
  id: string;
  /** Optional user email address. */
  email?: string;
  /** Optional user display name or username. */
  username?: string;
  /** Optional authorization realm (defaults to 'internal'). */
  realm?: string;
  /** Additional custom identity claims. */
  [key: string]: WachterUserClaimValue;
}

/**
 * Configuration options for generating Wachter Gateway HTTP headers.
 */
export interface WachterHeadersConfig {
  /** Target service name for routing (e.g. 'Repository'). */
  service?: string;
  /** Name of the header carrying service name. Defaults to 'service'. */
  serviceHeader?: string;
  /** Bearer token or authorization string. Automatically prefixes with 'Bearer ' if needed. */
  token?: string;
  /** Raw authorization header value. Overrides token if specified. */
  authorization?: string;
  /** User identity metadata passed in headers. */
  user?: WachterUserIdentity;
  /** Prefix for user identity header keys. Defaults to 'x-woody-meta-user-identity-'. */
  userPrefix?: string;
}

/**
 * Creates standard HTTP headers for Vality Wachter Gateway.
 */
export function createWachterHeaders(config?: WachterHeadersConfig): Record<string, string> {
  const headers: Record<string, string> = {};
  const userPrefix = config?.userPrefix ?? "x-woody-meta-user-identity-";

  if (config?.service) {
    const serviceHeaderName = config.serviceHeader ?? "service";
    headers[serviceHeaderName] = config.service;
  }

  if (config?.authorization) {
    headers["authorization"] = config.authorization;
  } else if (config?.token) {
    headers["authorization"] = config.token.startsWith("Bearer ")
      ? config.token
      : `Bearer ${config.token}`;
  }

  if (config?.user) {
    headers[`${userPrefix}id`] = config.user.id;
    if (config.user.email !== undefined && config.user.email !== null) {
      headers[`${userPrefix}email`] = config.user.email;
    }
    if (config.user.username !== undefined && config.user.username !== null) {
      headers[`${userPrefix}username`] = config.user.username;
    }
    headers[`${userPrefix}realm`] = config.user.realm ?? "internal";

    for (const [key, val] of Object.entries(config.user)) {
      if (
        !["id", "email", "username", "realm"].includes(key) &&
        val !== undefined &&
        val !== null
      ) {
        headers[`${userPrefix}${key}`] = String(val);
      }
    }
  }

  return headers;
}
