import { defer, type Observable } from "rxjs";

/**
 * Wraps a Promise-returning Thrift client method call into a cold RxJS Observable.
 * Defers execution until subscribed and cleans up properly.
 */
export function deferThriftCall<T>(callFactory: () => Promise<T>): Observable<T> {
  return defer(callFactory);
}

/**
 * Type mapping Promise-based client methods to Observable-based client methods.
 */
export type ObservableClient<TClient extends object> = {
  [K in keyof TClient]: TClient[K] extends (...args: infer Args) => Promise<infer R>
    ? (...args: Args) => Observable<R>
    : TClient[K];
};

/**
 * Creates an Observable wrapper around a Promise-based Thrift client instance,
 * turning each method into a method returning a cold RxJS Observable.
 */
export function toObservableClient<TClient extends object>(
  client: TClient,
): ObservableClient<TClient> {
  return new Proxy(client as any, {
    get(target, prop: string | symbol) {
      const original = (target as any)[prop];
      if (typeof original !== "function") return original;
      return (...args: unknown[]) => defer(() => original.apply(target, args));
    },
  });
}
