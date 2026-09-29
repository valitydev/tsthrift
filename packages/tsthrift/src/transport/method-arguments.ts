/** Argument count carried by metadata methods for adapters that append RequestOptions. */
export const THRIFT_METHOD_ARGUMENT_COUNT: unique symbol = Symbol.for(
  "@vality/tsthrift/method-argument-count",
);

/** Identifies methods explicitly wrapped to return ThriftResult. */
export const THRIFT_METHOD_RESULT: unique symbol = Symbol.for("@vality/tsthrift/method-result");
