import { THRIFT_ERROR_BRAND } from "./error-brand.ts";

export interface ThriftCallContext {
  serviceName: string;
  namespace: string;
  method: string;
  sequenceId: number;
  durationMs: number;
  traceId?: string;
}

/** Recognizes errors across installed copies of the runtime. */
export function isThriftError(error: unknown): error is ThriftError {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as Record<symbol, unknown>)[THRIFT_ERROR_BRAND] === true
  );
}

/** Base error for all Thrift transport and RPC failures. */
export class ThriftError extends Error {
  public context?: ThriftCallContext;
  public readonly isSystem: boolean = false;
  public readonly isService: boolean = false;

  constructor(message: string) {
    super(message);
    Object.defineProperty(this, THRIFT_ERROR_BRAND, { value: true });
    this.name = "ThriftError";
  }
}
