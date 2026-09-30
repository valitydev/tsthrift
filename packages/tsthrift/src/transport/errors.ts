import { ThriftError, isThriftError } from "./thrift-error.ts";

export { ThriftError, isThriftError } from "./thrift-error.ts";
export type { ThriftCallContext } from "./thrift-error.ts";
export { ThriftServiceError, catchServiceError, isThriftServiceError } from "./service-error.ts";

/** Error raised when the server responds with a non-200 HTTP status code (e.g. 4xx or 5xx). */
export class ThriftHttpError extends ThriftError {
  public override name = "ThriftHttpError";
  public override readonly isSystem = true as const;
  public override readonly isService = false as const;

  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body?: string,
  ) {
    super(`HTTP request failed with status ${status} ${statusText}`);
    this.body = body?.slice(0, 1024);
  }
}

/** Error raised when a request exceeds its configured timeout duration. */
export class ThriftTimeoutError extends ThriftError {
  public override name = "ThriftTimeoutError";
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
  public override name = "ThriftConnectionError";
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
  public override name = "ThriftProtocolError";
  public override readonly isSystem = true as const;
  public override readonly isService = false as const;

  constructor(message: string) {
    super(message);
  }
}

/** Error raised when the Thrift server returns a TApplicationException. */
export class ThriftApplicationError extends ThriftError {
  public override name = "ThriftApplicationError";
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
  return isThriftError(error) && error.isSystem === true;
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
