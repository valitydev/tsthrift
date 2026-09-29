import {
  type Observable,
  type ObservableInput,
  type ObservedValueOf,
  catchError,
  throwError,
} from "rxjs";
import { type ThriftError, type ThriftServiceError, isThriftServiceError } from "@vality/tsthrift";

/**
 * RxJS operator that catches a specific declared Thrift service error by name and routes it to a handler.
 * If the error is not of the specified name, it is automatically re-thrown into the error channel.
 */
export function catchThriftError<TName extends string, R, TDataType extends object = any>(
  name: TName,
  handler: (error: ThriftServiceError<TName, TDataType>) => ObservableInput<R>,
): <TData>(source$: Observable<TData>) => Observable<TData | ObservedValueOf<R>>;

/**
 * RxJS operator that matches declared Thrift service errors against a dictionary of handlers.
 * If an incoming error name is found in the dictionary, its handler is invoked.
 * Unmatched errors are automatically re-thrown into the error channel.
 */
export function catchThriftError<R>(
  handlers: Record<string, (error: ThriftServiceError<any, any>) => ObservableInput<R>>,
): <TData>(source$: Observable<TData>) => Observable<TData | ObservedValueOf<R>>;

/**
 * RxJS operator that catches errors with typed error inspection in the handler.
 */
export function catchThriftError<TError = ThriftError, R = any>(
  handler: (error: TError) => ObservableInput<R>,
): <TData>(source$: Observable<TData>) => Observable<TData | ObservedValueOf<R>>;

export function catchThriftError(...args: any[]): any {
  if (typeof args[0] === "string" && typeof args[1] === "function") {
    const [name, handler] = args;
    return (source$: Observable<any>) =>
      source$.pipe(
        catchError((error) => {
          if (isThriftServiceError(error, name)) {
            return handler(error);
          }
          return throwError(() => error);
        }),
      );
  }
  if (typeof args[0] === "object" && args[0] !== null) {
    const handlers = args[0];
    return (source$: Observable<any>) =>
      source$.pipe(
        catchError((error) => {
          if (
            error !== null &&
            typeof error === "object" &&
            "name" in error &&
            typeof (error as any).name === "string" &&
            Object.hasOwn(handlers, (error as any).name)
          ) {
            const handler = handlers[(error as any).name];
            if (typeof handler === "function") {
              return handler(error);
            }
          }
          return throwError(() => error);
        }),
      );
  }
  if (typeof args[0] === "function") {
    const handler = args[0];
    return (source$: Observable<any>) => source$.pipe(catchError((error) => handler(error)));
  }
  throw new TypeError("Invalid arguments passed to catchThriftError");
}

/**
 * Alias for catchThriftError supporting typed error handling in RxJS.
 */
export const catchTypedError: typeof catchThriftError = catchThriftError;
