import type { HttpTransportConfig, ThriftLogParams } from "./types.ts";

/** Logging is observational and must never alter an RPC result. */
export function emitLog(logger: HttpTransportConfig["loggingFn"], event: ThriftLogParams): void {
  try {
    const result: unknown = logger?.(event);
    if (result && typeof (result as PromiseLike<unknown>).then === "function") {
      void Promise.resolve(result).catch(() => {});
    }
  } catch {
    // Logger failures are isolated from transport and application execution.
  }
}
