import { Observable, type OperatorFunction, catchError, map, of } from "rxjs";
import { createObservableMethod } from "./observable-method.ts";
import type { RequestOptions, ThriftResult } from "@vality/tsthrift";

/**
 * RxJS operator that unwraps a ThriftResult.
 * If the result contains an error, it throws the error into the Observable error channel.
 * Otherwise, it emits the data into the next channel.
 */
export function unwrapResult<TData, TError = unknown>(): OperatorFunction<
  ThriftResult<TData, TError>,
  TData
> {
  return (source$) =>
    source$.pipe(
      map((result) => {
        if (result.error !== undefined) {
          throw result.error;
        }
        return (result as { data: TData }).data;
      }),
    );
}

/**
 * RxJS operator that catches errors from an Observable and wraps into a ThriftResult { data, error }.
 * Emits { data, error: undefined } on success, or { data: undefined, error } on error, then completes.
 */
export function catchThriftResult<TData, TError = unknown>(): OperatorFunction<
  TData,
  ThriftResult<TData, TError>
> {
  return (source$) =>
    source$.pipe(
      map((data) => ({ data, error: undefined }) as ThriftResult<TData, TError>),
      catchError((error) => of({ data: undefined, error: error as TError })),
    );
}

/**
 * Wraps a Promise-returning Thrift client method call into a cold RxJS Observable.
 * Defers execution until subscribed and cleans up properly.
 * Unwraps ThriftResult and emits errors into the error channel.
 */
export function deferThriftCall<T>(
  callFactory: (options?: RequestOptions) => Promise<T>,
): Observable<T extends ThriftResult<infer TData, any> ? TData : T> {
  return new Observable((subscriber) => {
    const abortController = new AbortController();
    Promise.resolve(callFactory({ signal: abortController.signal }))
      .then((result: any) => {
        if (
          result !== null &&
          typeof result === "object" &&
          "data" in result &&
          "error" in result
        ) {
          if (result.error !== undefined) {
            if (!abortController.signal.aborted) {
              subscriber.error(result.error);
            }
            return;
          }
          subscriber.next(result.data);
          subscriber.complete();
          return;
        }
        subscriber.next(result);
        subscriber.complete();
      })
      .catch((err) => {
        if (!abortController.signal.aborted) {
          subscriber.error(err);
        }
      });
    return () => {
      abortController.abort();
    };
  });
}

/**
 * Type mapping Promise-based client methods to Observable-based client methods.
 * Unwraps ThriftResult into plain data in Observables and emits declared exceptions
 * or system errors into the error channel (real throw).
 */
export type ObservableClient<TClient extends object> = {
  [K in keyof TClient]: TClient[K] extends (
    ...args: infer Args
  ) => Promise<ThriftResult<infer TData, any>>
    ? (...args: Args) => Observable<TData>
    : TClient[K] extends (...args: infer Args) => Promise<infer R>
      ? (...args: Args) => Observable<R>
      : TClient[K];
} & {
  /** Access to the underlying raw Promise-based client instance. */
  promise: TClient;
};

/**
 * Creates an Observable wrapper around a Promise-based Thrift client instance,
 * turning each method into a method returning a cold RxJS Observable with
 * real throw error propagation and automatic cancellation via AbortSignal upon unsubscription.
 */
export function toObservableClient<TClient extends object>(
  client: TClient,
  unwrap = true,
): ObservableClient<TClient> {
  return new Proxy(client as any, {
    get(target, prop: string | symbol) {
      if (typeof prop !== "string" || prop === "then") return undefined;
      if (prop === "promise") return client;
      const original = (target as any)[prop];
      if (typeof original === "function") {
        return createObservableMethod(target, original, unwrap);
      }
      return original;
    },
  });
}
