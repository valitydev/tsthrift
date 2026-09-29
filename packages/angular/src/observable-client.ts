import { createObservableMethod } from "./observable-method.ts";
import type { ObservableClient } from "./rxjs.ts";

/**
 * Creates an Observable wrapper around a Promise-based Thrift client instance,
 * turning each method into a method returning a cold RxJS Observable with
 * real throw error propagation and automatic cancellation via AbortSignal upon unsubscription.
 */
export function wrapObservableClient<TClient extends object, TUnwrap extends boolean = true>(
  client: TClient,
  unwrap: TUnwrap = true as TUnwrap,
  argumentCounts?: Readonly<Record<string, number>>,
): ObservableClient<TClient, TUnwrap> {
  return new Proxy(client as any, {
    get(target, prop: string | symbol) {
      if (typeof prop !== "string" || prop === "then") return undefined;
      const original = (target as any)[prop];
      if (typeof original === "function") {
        return createObservableMethod(target, original, unwrap, argumentCounts?.[prop]);
      }
      return original;
    },
  });
}
