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
