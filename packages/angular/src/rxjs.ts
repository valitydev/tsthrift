import { Observable, type OperatorFunction, catchError, map, of } from "rxjs";
import {
  type RequestOptions,
  THRIFT_ERRORS,
  THRIFT_METHOD_RESULT,
  type ThriftError,
  type ThriftMethodError,
  type ThriftResult,
} from "@vality/tsthrift";

/**
 * A typed RxJS Observable carrying compile-time metadata about potential Thrift method errors.
 * At runtime, this is a standard RxJS Observable instance with 100% interoperability.
 */
export interface ThriftObservable<TData, TError = ThriftError> extends Observable<TData> {
  /** Phantom field retaining the compile-time method error type. */
  readonly [THRIFT_ERRORS]?: TError;
}

/**
 * RxJS operator that unwraps a ThriftResult.
 * If the result contains an error, it throws the error into the Observable error channel.
 * Otherwise, it emits the data into the next channel.
 */
export function unwrapThriftResult<TData, TError = unknown>(): OperatorFunction<
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
 * When applied to a ThriftObservable, automatically infers the precise method error type.
 */
export function catchThriftResult<TData, TError>(): (
  source$: ThriftObservable<TData, TError>,
) => Observable<ThriftResult<TData, TError>>;
export function catchThriftResult<TData, TError = ThriftError>(): OperatorFunction<
  TData,
  ThriftResult<TData, TError>
>;
export function catchThriftResult<TData, TError>(): any {
  return (source$: Observable<TData>) =>
    source$.pipe(
      map((data) => ({ data, error: undefined }) as ThriftResult<TData, TError>),
      catchError((error) => of({ data: undefined, error: error as TError })),
    );
}

/**
 * Wraps a Promise-returning Thrift client method call into a cold RxJS Observable.
 * Defers execution until subscribed and cleans up properly.
 * Preserves returned values; use unwrapThriftResult() explicitly for Result calls.
 */
export function deferThriftCall<T>(
  callFactory: (options?: RequestOptions) => Promise<T>,
): Observable<T> {
  return new Observable((subscriber) => {
    const controller = new AbortController();
    Promise.resolve()
      .then(() => {
        controller.signal.throwIfAborted();
        return callFactory({ signal: controller.signal });
      })
      .then(
        (value) => {
          if (!subscriber.closed) {
            subscriber.next(value);
            subscriber.complete();
          }
        },
        (error: unknown) => {
          if (!subscriber.closed) subscriber.error(error);
        },
      );
    return () => controller.abort();
  });
}

/**
 * Type mapping Promise-based client methods to Observable-based client methods.
 * Unwraps ThriftResult into plain data in Observables and emits declared exceptions
 * or system errors into the error channel (real throw).
 * Returned streams are ThriftObservables carrying compile-time error types.
 */
export type ObservableClient<TClient extends object, TUnwrap extends boolean = true> = {
  [K in Extract<keyof TClient, string>]: TClient[K] extends (
    ...args: infer Args
  ) => Promise<infer R>
    ? (
        ...args: Args
      ) => ThriftObservable<
        TUnwrap extends false
          ? R
          : TClient extends { readonly [THRIFT_METHOD_RESULT]: true }
            ? R extends { data: infer Data; error: undefined }
              ? Data
              : never
            : R,
        ThriftMethodError<TClient, K>
      >
    : TClient[K];
};

export { catchThriftError } from "./catch-thrift-error.ts";
