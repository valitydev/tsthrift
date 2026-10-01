import { isThriftError } from "./thrift-error.ts";
import type { HttpTransportConfig, ThriftLogError, ThriftLogParams } from "./types.ts";

type ThriftLogger = NonNullable<HttpTransportConfig["loggingFn"]>;

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

/**
 * Summarizes a failure for log events. Diagnostic codes are always kept; declared
 * exception fields are payload data and are included only with `logPayloads`.
 * Fields are read structurally so errors from other installed runtime copies match.
 */
export function toLogError(error: unknown, logPayloads = false): ThriftLogError {
  if (!(error instanceof Error)) return { name: "UnknownError" };
  const summary: ThriftLogError = { name: error.name, message: error.message };
  if (error.stack) summary.stack = error.stack;
  if (!isThriftError(error)) return summary;
  const fields = error as unknown as Record<string, unknown>;
  if (typeof fields.status === "number") summary.status = fields.status;
  if (typeof fields.code === "number") summary.code = fields.code;
  if (logPayloads && error.isService && typeof fields.data === "object" && fields.data !== null)
    summary.data = fields.data;
  return summary;
}

/**
 * Combines several logging callbacks into one. Falsy entries are skipped, so loggers can
 * be enabled conditionally; each logger is isolated from failures of the others.
 */
export function combineLoggers(
  ...loggers: (ThriftLogger | false | null | undefined)[]
): ThriftLogger {
  const active = loggers.filter((logger): logger is ThriftLogger => typeof logger === "function");
  return (event) => {
    for (const logger of active) emitLog(logger, event);
  };
}
