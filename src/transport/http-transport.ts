import {
  ThriftConnectionError,
  ThriftError,
  ThriftHttpError,
  ThriftProtocolError,
  ThriftTimeoutError,
} from "./errors.ts";
import type {
  HeaderProvider,
  RequestOptions,
  ThriftClientConfig,
  TransportFunction,
} from "./types.ts";

const THRIFT_CONTENT_TYPE = "application/x-thrift";
const DEFAULT_TIMEOUT_MS = 60_000;

async function resolveHeaders(provider?: HeaderProvider): Promise<Record<string, string>> {
  if (!provider) return {};
  if (typeof provider === "function") {
    return (await provider()) ?? {};
  }
  return { ...provider };
}

function isThriftContentType(contentType: string): boolean {
  const normalized = contentType.toLowerCase();
  return (
    normalized.includes(THRIFT_CONTENT_TYPE) ||
    normalized.includes("application/octet-stream") ||
    normalized === ""
  );
}

/**
 * Creates an HTTP transport function for Thrift Binary Protocol RPC over HTTP POST.
 */
export function createHttpTransport(config: ThriftClientConfig): TransportFunction {
  const fetchFn = config.fetch ?? globalThis.fetch;
  if (typeof fetchFn !== "function") {
    throw new Error("No global fetch found and none provided in ThriftClientConfig");
  }

  return async function httpTransport(
    payload: Uint8Array,
    options?: RequestOptions,
  ): Promise<Uint8Array> {
    const timeoutMs = options?.timeoutMs ?? config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const baseHeaders = await resolveHeaders(config.headers);
    const headers: Record<string, string> = {
      Accept: THRIFT_CONTENT_TYPE,
      "Content-Type": THRIFT_CONTENT_TYPE,
      ...baseHeaders,
      ...options?.headers,
    };

    const controller = new AbortController();
    let isTimedOut = false;
    const timer = setTimeout(() => {
      isTimedOut = true;
      controller.abort(new ThriftTimeoutError(timeoutMs));
    }, timeoutMs);

    const userSignal = options?.signal;
    const onUserAbort = () => {
      clearTimeout(timer);
      controller.abort(userSignal?.reason);
    };

    if (userSignal) {
      if (userSignal.aborted) {
        clearTimeout(timer);
        throw userSignal.reason ?? new DOMException("The operation was aborted", "AbortError");
      }
      userSignal.addEventListener("abort", onUserAbort, { once: true });
    }

    try {
      const response = await fetchFn(config.endpoint, {
        method: "POST",
        headers,
        body: payload,
        signal: controller.signal,
      });

      if (response.status !== 200) {
        const bodyText = await response.text().catch(() => "");
        throw new ThriftHttpError(response.status, response.statusText, bodyText);
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (!isThriftContentType(contentType)) {
        throw new ThriftProtocolError(
          `Unexpected response content-type "${contentType}", expected "${THRIFT_CONTENT_TYPE}"`,
        );
      }

      const buffer = await response.arrayBuffer();
      return new Uint8Array(buffer);
    } catch (error: unknown) {
      if (error instanceof ThriftError) {
        throw error;
      }
      if (isTimedOut) {
        throw new ThriftTimeoutError(timeoutMs);
      }
      if (userSignal?.aborted) {
        throw userSignal.reason ?? error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new ThriftConnectionError(
        `Thrift HTTP request to ${config.endpoint} failed: ${message}`,
        error,
      );
    } finally {
      clearTimeout(timer);
      if (userSignal) {
        userSignal.removeEventListener("abort", onUserAbort);
      }
    }
  };
}
