export { createMetadataClient } from "./metadata/client.ts";
export { createLazyMetadataClient } from "./metadata/lazy-client.ts";
export { createMetadataLoader, createNamespaceLoader } from "./metadata/loader.ts";
export type {
  MetadataImportModule,
  MetadataLoaderFn,
  MetadataLoaderOptions,
} from "./metadata/loader.ts";
export { MetadataIndex } from "./metadata/index.ts";
export type {
  DynamicThriftClient,
  MetadataClientConfig,
  ServiceClientConfig,
} from "./metadata/client.ts";
export type {
  Field,
  I64Mode,
  Metadata,
  Method,
  Service,
  ThriftAst,
  ValueType,
} from "./metadata/types.ts";
export * from "./transport/errors.ts";
export { createHttpTransport, mergeHeaderProviders } from "./transport/http-transport.ts";
export { THRIFT_ERRORS, toThriftResult, unwrapResult } from "./transport/types.ts";
export type {
  HeaderProvider,
  MetadataModule,
  MetadataSource,
  RequestOptions,
  HttpTransportConfig,
  ThriftLogParams,
  ThriftMethodError,
  ThriftResult,
  ThriftResultClient,
  ThriftServiceDescriptor,
  TransportFunction,
} from "./transport/types.ts";
export {
  BASE64_ALPHABET,
  FlakeId,
  WOODY_HEADERS,
  bs64,
  createWoodyHeaders,
  resolveWoodyHeaders,
  createWoodyHeaderProvider,
  flattenMeta,
  generateId,
} from "./transport/woody.ts";
export type {
  FlakeIdOptions,
  WoodyHeadersConfig,
  WoodyMetaMap,
  WoodyMetaProvider,
  WoodyMetaScalar,
  WoodyMetaValue,
} from "./transport/woody.ts";
export { createWachterHeaders } from "./transport/wachter.ts";
export type {
  WachterHeadersConfig,
  WachterUserClaimValue,
  WachterUserIdentity,
} from "./transport/wachter.ts";
export * from "./runtime.ts";
export {
  THRIFT_METHOD_ARGUMENT_COUNT,
  THRIFT_METHOD_RESULT,
} from "./transport/method-arguments.ts";

export { thriftMethodName } from "./metadata/method-name.ts";
export { validateThriftAst } from "./metadata/validate-ast.ts";
