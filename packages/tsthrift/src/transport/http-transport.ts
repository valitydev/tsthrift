import {
  ThriftConnectionError,
  ThriftError,
  ThriftHttpError,
  ThriftProtocolError,
  ThriftTimeoutError,
} from "./errors.ts";
import type { RequestOptions, HttpTransportConfig, TransportFunction } from "./types.ts";
import { mergeHeaders, resolveHeaders } from "./headers.ts";
import { readResponseBody } from "./response-body.ts";
import { createWoodyHeaders, WOODY_HEADERS } from "./woody.ts";

export { mergeHeaderProviders } from "./headers.ts";

const THRIFT_CONTENT_TYPE = "application/x-thrift";
const DEFAULT_TIMEOUT_MS = 60_000;

/** Creates an HTTP transport with a deadline covering preparation, fetch, and response reading. */
export function createHttpTransport(config: HttpTransportConfig): TransportFunction {
  const fetchFn = config.fetch ?? globalThis.fetch;
  if (typeof fetchFn !== "function") {
    throw new Error("No global fetch found and none provided in HttpTransportConfig");
  }

  return async function httpTransport(
    payload: Uint8Array,
    options?: RequestOptions,
  ): Promise<Uint8Array> {
    const timeoutMs = options?.timeoutMs ?? config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs < 0 || timeoutMs > 2147483647) {
      throw new RangeError("timeoutMs must be between 0 and 2147483647");
    }
    const controller = new AbortController();
    const userSignal = options?.signal;
    const onUserAbort = () => controller.abort(userSignal?.reason);
    if (userSignal?.aborted) throw userSignal.reason;
    userSignal?.addEventListener("abort", onUserAbort, { once: true });
    const timer = setTimeout(() => controller.abort(new ThriftTimeoutError(timeoutMs)), timeoutMs);
    let onAbort: () => void = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener("abort", onAbort, { once: true });
    });
    const send = async () => {
      const baseHeaders = await resolveHeaders(config.headers);
      controller.signal.throwIfAborted();
      let woodyHeaders: Record<string, string> | undefined;
      if (config.woody) {
        woodyHeaders = createWoodyHeaders(
          typeof config.woody === "object" ? config.woody : undefined,
        );
        if (!woodyHeaders[WOODY_HEADERS.DEADLINE]) {
          woodyHeaders[WOODY_HEADERS.DEADLINE] = new Date(startedAt + timeoutMs).toISOString();
        }
      }
      const headers = mergeHeaders(
        { Accept: THRIFT_CONTENT_TYPE, "Content-Type": THRIFT_CONTENT_TYPE },
        woodyHeaders,
        baseHeaders,
        options?.headers,
      );
      const response = await fetchFn(config.endpoint, {
        method: "POST",
        headers,
        body: payload as BodyInit,
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        await response.body?.cancel().catch(() => {});
        controller.signal.throwIfAborted();
      }
      if (response.status !== 200) {
        const bodyText = new TextDecoder().decode(
          await readResponseBody(response, controller.signal),
        );
        throw new ThriftHttpError(response.status, response.statusText, bodyText);
      }
      const contentType = (response.headers.get("content-type") ?? "")
        .split(";", 1)[0]!
        .trim()
        .toLowerCase();
      if (!["", THRIFT_CONTENT_TYPE, "application/octet-stream"].includes(contentType)) {
        await response.body?.cancel().catch(() => {});
        throw new ThriftProtocolError(
          `Unexpected response content-type "${contentType}", expected "${THRIFT_CONTENT_TYPE}"`,
        );
      }
      return readResponseBody(response, controller.signal);
    };
    const startedAt = Date.now();
    try {
      return await Promise.race([send(), aborted]);
    } catch (error: unknown) {
      if (controller.signal.aborted) throw controller.signal.reason;
      if (error instanceof ThriftError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new ThriftConnectionError(
        `Thrift HTTP request to ${config.endpoint} failed: ${message}`,
        error,
      );
    } finally {
      clearTimeout(timer);
      userSignal?.removeEventListener("abort", onUserAbort);
      controller.signal.removeEventListener("abort", onAbort);
    }
  };
}
