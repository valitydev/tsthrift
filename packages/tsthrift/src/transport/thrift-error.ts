/** Base error for all Thrift transport and RPC failures. */
export class ThriftError extends Error {
  public readonly isSystem: boolean = false;
  public readonly isService: boolean = false;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
