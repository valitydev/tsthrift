import { ThriftError } from "./thrift-error.ts";

export const THRIFT_EXCEPTION_INFO: unique symbol = Symbol.for("tsthrift.exception");

export interface ThriftExceptionMeta {
  type: string;
  fieldName: string;
}

export function getThriftExceptionInfo(error: unknown): ThriftExceptionMeta | undefined {
  if (error && typeof error === "object") {
    return (error as Record<symbol, unknown>)[THRIFT_EXCEPTION_INFO] as
      | ThriftExceptionMeta
      | undefined;
  }
  return undefined;
}

/** Error raised when a Thrift RPC returns a declared service exception. */
export class ThriftServiceError<
  TType extends string = string,
  TData extends object = object,
> extends ThriftError {
  public override readonly isSystem = false as const;
  public override readonly isService = true as const;
  public readonly type: TType;
  public readonly fieldName: string;
  public readonly data: TData;

  constructor(type: TType, fieldName: string, data: TData) {
    super(`Thrift service error [${type}]`);
    this.name = type;
    this.type = type;
    this.fieldName = fieldName;
    this.data = data;
    for (const key of Object.keys(data)) {
      if (!(key in this)) {
        Object.defineProperty(this, key, {
          value: (data as Record<string, unknown>)[key],
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
    }
    Object.defineProperty(this, THRIFT_EXCEPTION_INFO, {
      value: { type, fieldName },
      enumerable: false,
      configurable: true,
    });
  }
}

/** Type guard checking if an error is a declared Thrift service exception. */
export function isThriftServiceError<TType extends string = string, TData extends object = object>(
  error: unknown,
  expectedType?: TType,
): error is ThriftServiceError<TType, TData> {
  if (error instanceof ThriftServiceError) {
    return expectedType === undefined || (error.type as string) === expectedType;
  }
  return false;
}

/**
 * Catches and handles a ThriftServiceError (declared exception).
 * Optionally matches against a specific error type name.
 * Returns the handler result if handled, or undefined if the error does not match.
 */
export function catchServiceError<TError extends ThriftServiceError = ThriftServiceError, R = void>(
  error: unknown,
  handler: (error: TError) => R,
): R | undefined;
export function catchServiceError<TError extends ThriftServiceError = ThriftServiceError, R = void>(
  error: unknown,
  expectedType: string,
  handler: (error: TError) => R,
): R | undefined;
export function catchServiceError<TError extends ThriftServiceError = ThriftServiceError, R = void>(
  error: unknown,
  expectedTypeOrHandler: string | ((error: TError) => R),
  maybeHandler?: (error: TError) => R,
): R | undefined {
  const expectedType =
    typeof expectedTypeOrHandler === "string" ? expectedTypeOrHandler : undefined;
  const handler =
    typeof expectedTypeOrHandler === "function" ? expectedTypeOrHandler : maybeHandler!;

  error = normalizeThriftError(error);
  if (isThriftServiceError<any, any>(error, expectedType)) {
    return handler(error as TError);
  }
  return undefined;
}

/** Wraps tagged RPC payloads while preserving existing wrappers and unrelated errors. */
export function normalizeThriftError(error: unknown): unknown {
  if (error instanceof ThriftServiceError) return error;
  const info = getThriftExceptionInfo(error);
  return info && error && typeof error === "object"
    ? new ThriftServiceError(info.type, info.fieldName, error)
    : error;
}
