import type { ThriftLogParams } from "./transport/types.ts";

/** Console methods used by the console logger. */
export type ConsoleLoggerSink = Pick<Console, "groupCollapsed" | "groupEnd" | "log" | "error">;

export interface ConsoleLoggerOptions {
  /** Console-compatible output (defaults to `globalThis.console`). */
  console?: ConsoleLoggerSink;
  /** Log successful calls (default: `true`). Errors are always logged. */
  success?: boolean;
  /** Log call start events (default: `false`). */
  calls?: boolean;
}

/**
 * Creates a development logger that prints each RPC as a collapsed console group. The
 * label holds only text: status, `Service.method`, duration, trace ID, and
 * the failure reason. The group holds the namespace, then argument values in call order,
 * then the response, or for failures an `Error` carrying the call-site stack from the event.
 */
export function createConsoleLogger(
  options: ConsoleLoggerOptions = {},
): (params: ThriftLogParams) => void {
  const { success = true, calls = false } = options;
  return (event) => {
    const out = options.console ?? globalThis.console;
    const method = `${event.serviceName}.${event.name}`;
    if (event.type === "call") {
      if (calls) out.log(`⚪ ${method}`);
      return;
    }
    if (event.type === "success" && !success) return;
    const duration = event.durationMs === undefined ? "" : ` ${Math.round(event.durationMs)}ms`;
    const trace = event.traceId ? ` · trace ${event.traceId}` : "";
    const reason = event.error?.message || event.error?.name || "Unknown error";
    out.groupCollapsed(
      event.type === "error"
        ? `🔴 ${method}${duration}${trace} — ${reason}`
        : `🟢 ${method}${duration}${trace}`,
    );
    if (event.namespace) out.log(`namespace ${event.namespace}`);
    if (event.args?.length) out.log(...event.args);
    if (event.type === "error") {
      // `console.error` renders a real Error as an error entry with a linked stack.
      out.error(toError(event.error?.name ?? "Error", reason, event.error?.stack));
      const {
        name: _name,
        message: _message,
        stack: _stack,
        ...details
      } = event.error ?? { name: "" };
      if (Object.keys(details).length) out.log(details);
    } else if (event.response !== undefined) {
      out.log(event.response);
    }
    out.groupEnd();
  };
}

/** Consoles render an `Error` from its `stack`, so the logged stack is restored onto it. */
function toError(name: string, message: string, stack: string | undefined): Error {
  const error = new Error(message);
  error.name = name;
  error.stack = stack ?? `${name}: ${message}`;
  return error;
}
