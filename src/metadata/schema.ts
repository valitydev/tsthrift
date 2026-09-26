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

/** The legacy metadata shape consumed by ng-thrift. */
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
  path: string;
  name: string;
  ast: ThriftAst;
}
