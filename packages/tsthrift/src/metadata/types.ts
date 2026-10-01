export type ValueType =
  | string
  | { name: "list" | "set"; valueType: ValueType }
  | { name: "map"; keyType: ValueType; valueType: ValueType };

export interface Field {
  id?: number;
  name: string;
  type: ValueType;
  option?: "required" | "optional";
  defaultValue?: unknown;
}

export interface Method {
  name: string;
  type: ValueType;
  args: Field[];
  throws: Field[];
  oneway: boolean;
}

export interface Service {
  extends?: string;
  functions: Record<string, Method>;
}

export interface ThriftAst {
  namespace?: Record<string, { serviceName: string }>;
  include?: Record<string, { path: string }>;
  typedef?: Record<string, { type: ValueType }>;
  const?: Record<string, { type: ValueType; value: unknown }>;
  enum?: Record<string, { items: { name: string; value?: number }[] }>;
  struct?: Record<string, Field[]>;
  union?: Record<string, Field[]>;
  exception?: Record<string, Field[]>;
  service?: Record<string, Service>;
}

export interface Metadata {
  /** Missing only for legacy metadata; newly emitted metadata uses version 1. */
  metadataVersion?: 1;
  build?: { i64: I64Mode; lowerCaseMethods: boolean; binary?: BinaryMode };
  path: string;
  name: string;
  ast: ThriftAst;
}

/** Public representation of IDL binary: Base64 string or raw bytes. */
export type BinaryMode = "base64" | "uint8array";

export type I64Mode = "bigint" | "number";
