import type { ThriftConverter } from "./converter/converter.ts";
import type { MetadataIndex } from "../metadata/index.ts";
import type { ClassRegistry, I64Mode } from "./converter/types.ts";
import type { HttpTransportConfig, MetadataSource } from "../transport/types.ts";

export interface ThriftClientConfig extends HttpTransportConfig {
  /** Optional metadata schemas for automatic plain-object <-> Thrift instance conversion. */
  metadata?: MetadataSource;
  /** Service namespace (optional if serviceName is unique or auto-inferred). */
  namespace?: string;
  /** Service name in IDL (e.g. "Example" or "UserService"). */
  serviceName?: string;
  /** 64-bit integer conversion strategy (defaults to "bigint"). */
  i64Mode?: I64Mode;
  /** Registry of Thrift constructor classes. */
  classRegistry?: ClassRegistry;
  /** Pre-configured converter instance. */
  converter?: ThriftConverter;
  /** Pre-built metadata index. */
  index?: MetadataIndex;
}
