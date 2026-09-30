/** Correlation data shared by the RPC envelope and its default HTTP transport. */
export const callContexts: WeakMap<Uint8Array, { traceId?: string }> = new WeakMap();
