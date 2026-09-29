import { createObservableMethod } from "./observable-method.ts";
import type { ObservableClient } from "./rxjs.ts";

function memberNames(target: object): string[] {
  const names = new Set<string>();
  for (let object: object | null = target; object && object !== Object.prototype;) {
    for (const name of Object.getOwnPropertyNames(object)) {
      if (name !== "constructor" && name !== "then") names.add(name);
    }
    object = Object.getPrototypeOf(object);
  }
  return [...names];
}

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
  const source = client as Record<string, unknown>;
  const wrapped: Record<string, unknown> = {};
  for (const name of memberNames(client)) {
    const original = source[name];
    if (typeof original === "function") {
      wrapped[name] = createObservableMethod(
        client,
        original as (...args: unknown[]) => Promise<unknown>,
        unwrap,
        argumentCounts?.[name],
      );
    } else {
      Object.defineProperty(wrapped, name, { get: () => source[name], enumerable: true });
    }
  }
  return wrapped as ObservableClient<TClient, TUnwrap>;
}
