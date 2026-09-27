import { createThriftQueryKey, normalizeCacheKey } from "./cache-key.ts";

export { createThriftQueryKey, normalizeCacheKey };

export interface ThriftQueryOptions<TData> {
  queryKey: unknown[];
  queryFn: (context?: { signal?: AbortSignal }) => Promise<TData>;
}

export interface ThriftMutationOptions<TData, TVariables extends unknown[]> {
  mutationKey: unknown[];
  mutationFn: (variables: TVariables) => Promise<TData>;
}

/**
 * Creates query options compatible with TanStack Query (React Query, Vue Query, etc.),
 * forwarding AbortSignal directly to the Thrift RPC request.
 */
export function createThriftQueryOptions<
  TClient extends Record<string, any>,
  TMethod extends keyof TClient,
>(
  serviceName: string,
  client: TClient,
  method: TMethod,
  args: any[] = [],
  options?: { scope?: Record<string, unknown>; requestOptions?: Record<string, unknown> },
): ThriftQueryOptions<any> {
  const queryKey = createThriftQueryKey(serviceName, String(method), args, options?.scope);
  return {
    queryKey,
    queryFn: (context?: { signal?: AbortSignal }) => {
      const mergedOptions = {
        ...options?.requestOptions,
        ...(context?.signal ? { signal: context.signal } : {}),
      };
      return client[method](...args, mergedOptions);
    },
  };
}

/**
 * Creates mutation options compatible with TanStack Query.
 */
export function createThriftMutationOptions<
  TClient extends Record<string, any>,
  TMethod extends keyof TClient,
>(
  serviceName: string,
  client: TClient,
  method: TMethod,
  options?: { scope?: Record<string, unknown>; requestOptions?: Record<string, unknown> },
): ThriftMutationOptions<any, any> {
  const mutationKey = createThriftQueryKey(serviceName, String(method), [], options?.scope);
  return {
    mutationKey,
    mutationFn: (variables: unknown[]) => {
      const varArray = Array.isArray(variables) ? variables : [variables];
      return client[method](...varArray, options?.requestOptions);
    },
  };
}
