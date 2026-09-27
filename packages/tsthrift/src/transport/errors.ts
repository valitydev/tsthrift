/** Base error for all Thrift transport and RPC failures. */
export class ThriftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/** Error raised when the server responds with a non-200 HTTP status code (e.g. 4xx or 5xx). */
export class ThriftHttpError extends ThriftError {
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
  constructor(
    public readonly timeoutMs: number,
    message?: string,
  ) {
    super(message ?? `Request timed out after ${timeoutMs}ms`);
  }
}

/** Error raised when network connectivity fails (DNS lookup, connection refused, reset). */
export class ThriftConnectionError extends ThriftError {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
  }
}

/** Error raised when the response format violates protocol expectations (e.g. HTML returned). */
export class ThriftProtocolError extends ThriftError {
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

/** Error raised when a Thrift RPC returns a declared service exception. */
export class ThriftServiceError<
  TType extends string = string,
  TData extends object = object,
> extends ThriftError {
  public readonly type: TType;
  public readonly fieldName: string;
  public readonly data: TData;

  constructor(type: TType, fieldName: string, data: TData) {
    super(`Thrift service error [${type}]`);
    this.name = type;
    this.type = type;
    this.fieldName = fieldName;
    this.data = data;
    Object.assign(this, data);
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
