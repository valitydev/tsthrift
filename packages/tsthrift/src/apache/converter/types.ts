export type * from "../../metadata/types.ts";
export type ClassRegistry = Record<string, any> | ((namespace: string, typeName: string) => any);
