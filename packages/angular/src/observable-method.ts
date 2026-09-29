import { Observable } from "rxjs";
import {
  type RequestOptions,
  THRIFT_METHOD_ARGUMENT_COUNT,
  THRIFT_METHOD_RESULT,
} from "@vality/tsthrift";

/** Wraps one invocation, preserving IDL argument positions and cancellation lifetime. */
export function createObservableMethod(
  target: any,
  method: (...args: unknown[]) => Promise<unknown>,
  unwrap: boolean,
  argumentCount?: number,
): (...args: unknown[]) => Observable<unknown> {
  return (...args: unknown[]) =>
    new Observable((subscriber) => {
      const controller = new AbortController();
      let sourceSignal: AbortSignal | undefined;
      const onAbort = () => controller.abort(sourceSignal?.reason);
      const invoke = (count?: number) => {
        if (subscriber.closed) return;
        const position = count ?? argumentCount;
        if (position === undefined)
          throw new TypeError(
            "Missing IDL argument count; provide argumentCounts for an external client",
          );
        const options = args[position] as RequestOptions | undefined;
        sourceSignal = options?.signal;
        if (sourceSignal?.aborted) onAbort();
        else sourceSignal?.addEventListener("abort", onAbort, { once: true });
        const callArgs = args.slice(0, position);
        callArgs.length = position;
        callArgs.push({ ...options, signal: controller.signal });
        return method.apply(target, callArgs);
      };
      const succeed = (result: any) => {
        if (
          unwrap &&
          THRIFT_METHOD_RESULT in method &&
          result !== null &&
          typeof result === "object" &&
          "data" in result &&
          "error" in result
        ) {
          if (result.error !== undefined) {
            subscriber.error(result.error);
            return;
          }
          subscriber.next(result.data);
        } else subscriber.next(result);
        subscriber.complete();
      };
      try {
        const count = (method as any)[THRIFT_METHOD_ARGUMENT_COUNT] as
          | number
          | Promise<number>
          | undefined;
        const result = count instanceof Promise ? count.then(invoke) : invoke(count);
        Promise.resolve(result).then(succeed, (error) => subscriber.error(error));
      } catch (error) {
        subscriber.error(error);
      }
      return () => {
        sourceSignal?.removeEventListener("abort", onAbort);
        controller.abort();
      };
    });
}
