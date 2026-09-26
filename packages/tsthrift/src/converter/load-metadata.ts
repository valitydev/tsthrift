import type { Metadata } from "./types.ts";

/**
 * Loads Thrift metadata JSON artifact over HTTP or from a URL via fetch.
 */
export async function loadMetadata(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Metadata[]> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const target =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    throw new Error(
      `Failed to load Thrift metadata from ${target}: ${response.status} ${response.statusText}`,
    );
  }
  return response.json() as Promise<Metadata[]>;
}
