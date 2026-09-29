/** Base error for all Thrift transport and RPC failures. */
export class ThriftError extends Error {
  public readonly isSystem: boolean = false;
  public readonly isService: boolean = false;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/** Error raised when the server responds with a non-200 HTTP status code (e.g. 4xx or 5xx). */
export class ThriftHttpError extends ThriftError {
  public override readonly isSystem = true as const;
  public override readonly isService = false as const;

  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body?: string,
  ) {
    super(`HTTP request failed with status ${status} ${statusText}${body ? `: ${body}` : ""}`);
  }
}

/** Error raised when a request exceeds its configured timeout duration. */
export class ThriftTimeoutError extends ThriftError {
  public override readonly isSystem = true as const;
  public override readonly isService = false as const;

  constructor(
    public readonly timeoutMs: number,
    message?: string,
  ) {
    super(message ?? `Request timed out after ${timeoutMs}ms`);
  }
}

/** Error raised when network connectivity fails (DNS lookup, connection refused, reset). */
export class ThriftConnectionError extends ThriftError {
  public override readonly isSystem = true as const;
  public override readonly isService = false as const;

  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
  }
}

/** Error raised when the response format violates protocol expectations (e.g. HTML returned). */
export class ThriftProtocolError extends ThriftError {
  public override readonly isSystem = true as const;
  public override readonly isService = false as const;

  constructor(message: string) {
    super(message);
  }
}

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

/** Error raised when the Thrift server returns a TApplicationException. */
export class ThriftApplicationError extends ThriftError {
  public override readonly isSystem = true as const;
  public override readonly isService = false as const;

  constructor(
    message: string,
    public readonly code: number,
  ) {
    super(message);
  }
}

export type ThriftSystemError =
  | ThriftHttpError
  | ThriftTimeoutError
  | ThriftConnectionError
  | ThriftProtocolError
  | ThriftApplicationError;

/** Type guard checking if an error is a system/network/protocol Thrift failure. */
export function isThriftSystemError(error: unknown): error is ThriftSystemError {
  return (
    error instanceof ThriftHttpError ||
    error instanceof ThriftTimeoutError ||
    error instanceof ThriftConnectionError ||
    error instanceof ThriftProtocolError ||
    error instanceof ThriftApplicationError
  );
}

/**
 * Catches and handles a ThriftSystemError (network, timeout, protocol, or application exception).
 * Returns the handler result if handled, or undefined if the error does not match.
 */
export function catchSystemError<R = void>(
  error: unknown,
  handler: (error: ThriftSystemError) => R,
): R | undefined {
  if (isThriftSystemError(error)) {
    return handler(error);
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
): error is ThriftServiceError<TType, TData> & TData {
  if (error instanceof ThriftServiceError) {
    return expectedType === undefined || (error.type as string) === expectedType;
  }
  if (error && typeof error === "object") {
    const info = getThriftExceptionInfo(error);
    if (info) {
      return expectedType === undefined || info.type === expectedType;
    }
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
