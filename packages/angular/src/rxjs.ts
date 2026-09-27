import { map, Observable, type OperatorFunction } from "rxjs";
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

function combineSignals(a?: AbortSignal, b?: AbortSignal): AbortSignal | undefined {
  if (!a) return b;
  if (!b) return a;
  if ("any" in AbortSignal && typeof (AbortSignal as any).any === "function") {
    return (AbortSignal as any).any([a, b]);
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort(a.aborted ? a.reason : b.reason);
  if (a.aborted || b.aborted) {
    onAbort();
    return controller.signal;
  }
  a.addEventListener("abort", onAbort, { once: true });
  b.addEventListener("abort", onAbort, { once: true });
  return controller.signal;
}

function createObservableMethod(
  target: any,
  method: (...args: unknown[]) => Promise<unknown>,
  unwrap: boolean,
) {
  return (...args: unknown[]) =>
    new Observable((subscriber) => {
      const abortController = new AbortController();
      const lastArg = args[args.length - 1];
      const hasOptions =
        lastArg !== null &&
        typeof lastArg === "object" &&
        ("signal" in lastArg || "headers" in lastArg || "timeoutMs" in lastArg);

      let callArgs: unknown[];
      if (hasOptions) {
        const options = lastArg as RequestOptions;
        const mergedSignal = combineSignals(options.signal, abortController.signal);
        callArgs = [...args.slice(0, -1), { ...options, signal: mergedSignal }];
      } else {
        callArgs = [...args, { signal: abortController.signal }];
      }

      Promise.resolve(method.apply(target, callArgs))
        .then((result: any) => {
          if (
            unwrap &&
            result !== null &&
            typeof result === "object" &&
            ("data" in result || "error" in result)
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
          ("data" in result || "error" in result)
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

export type ObservableSafeClient<TClient extends object> = {
  [K in keyof TClient]: TClient[K] extends (...args: infer Args) => Promise<infer R>
    ? (...args: Args) => Observable<R>
    : TClient[K] extends object
      ? ObservableSafeClient<TClient[K]>
      : TClient[K];
};

/**
 * Type mapping Promise-based client methods to Observable-based client methods.
 * Unwraps ThriftResult into plain data in Observables and emits declared exceptions
 * or system errors into the error channel (real throw).
 * Preserves nested .safe sub-clients returning ThriftResult without throwing.
 */
export type ObservableClient<TClient extends object> = {
  [K in keyof TClient]: K extends "safe"
    ? TClient[K] extends object
      ? ObservableSafeClient<TClient[K]>
      : TClient[K]
    : TClient[K] extends (...args: infer Args) => Promise<ThriftResult<infer TData, any>>
      ? (...args: Args) => Observable<TData>
      : TClient[K] extends (...args: infer Args) => Promise<infer R>
        ? (...args: Args) => Observable<R>
        : TClient[K];
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
      const original = (target as any)[prop];
      if (typeof original === "function") {
        return createObservableMethod(target, original, unwrap);
      }
      if (prop === "safe" && original && typeof original === "object") {
        return toObservableClient(original, false);
      }
      return original;
    },
  });
}
