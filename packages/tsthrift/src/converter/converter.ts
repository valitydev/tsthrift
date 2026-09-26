import { MetadataIndex } from "./metadata-index.ts";
import { toPlainObject } from "./to-plain-object.ts";
import { toThriftInstance } from "./to-thrift-instance.ts";
import type { ConversionOptions, I64Mode, ValueType } from "./types.ts";

export class ThriftConverter {
  readonly index: MetadataIndex;
  readonly i64Mode: I64Mode;
  readonly classRegistry?: ConversionOptions["classRegistry"];

  constructor(options: ConversionOptions = {}) {
    this.index = new MetadataIndex(options.metadata ?? []);
    this.i64Mode = options.i64Mode ?? "bigint";
    this.classRegistry = options.classRegistry;
  }

  toThriftInstance(value: unknown, type: ValueType, namespace: string): unknown {
    return toThriftInstance(value, type, namespace, {
      index: this.index,
      i64Mode: this.i64Mode,
      classRegistry: this.classRegistry,
    });
  }

  toPlainObject(value: unknown, type: ValueType, namespace: string): unknown {
    return toPlainObject(value, type, namespace, {
      index: this.index,
      i64Mode: this.i64Mode,
    });
  }

  findService(serviceName: string, preferredNamespace?: string) {
    return this.index.findService(serviceName, preferredNamespace);
  }

  getMethod(namespace: string, serviceName: string, methodName: string) {
    return this.index.getMethod(namespace, serviceName, methodName);
  }
}

export function createConverter(options: ConversionOptions = {}): ThriftConverter {
  return new ThriftConverter(options);
}
