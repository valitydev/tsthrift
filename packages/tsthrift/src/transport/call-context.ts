/** Correlation data shared by the RPC envelope and its default HTTP transport. */
export const callContexts: WeakMap<Uint8Array, { traceId?: string }> = new WeakMap();

let pendingCallSite: Error | undefined;

/**
 * Runs `fn` with a call site captured earlier by a wrapper (e.g. the lazy client), so the
 * RPC started synchronously inside `fn` reports the caller instead of the wrapper's awaits.
 */
export function runWithCallSite<T>(callSite: Error, fn: () => T): T {
  const previous = pendingCallSite;
  pendingCallSite = callSite;
  try {
    return fn();
  } finally {
    pendingCallSite = previous;
  }
}

/** Returns the pending call site, or captures the current one. Call before any `await`. */
export function takeCallSite(): Error {
  const callSite = pendingCallSite ?? new Error();
  pendingCallSite = undefined;
  return callSite;
}

/**
 * Replaces an error's stack frames with the frames of its call site. Runtime errors are
 * created after network and decoding awaits, so their own stack holds only runtime frames.
 */
export function applyCallSite(error: Error, callSite: Error): void {
  const frames = callSite.stack?.split("\n").filter((line) => /^\s+at\s|@/.test(line));
  if (!frames?.length) return;
  try {
    error.stack = [`${error.name}: ${error.message}`, ...frames].join("\n");
  } catch {
    // Some engines expose a non-writable stack; the original stack is kept.
  }
}
