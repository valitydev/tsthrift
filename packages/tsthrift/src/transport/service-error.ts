import { ThriftError, isThriftError } from "./thrift-error.ts";

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
  }
}

/** Type guard checking if an error is a declared Thrift service exception. */
export function isThriftServiceError<TType extends string = string, TData extends object = object>(
  error: unknown,
  expectedType?: TType,
): error is ThriftServiceError<TType, TData> {
  if (isThriftError(error) && error.isService === true) {
    return expectedType === undefined || (error as ThriftServiceError).type === expectedType;
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

  if (isThriftServiceError(error, expectedType)) {
    return handler(error as TError);
  }
  return undefined;
}
