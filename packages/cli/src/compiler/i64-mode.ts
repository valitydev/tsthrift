import type { I64Mode } from "@vality/tsthrift";

export type { I64Mode };

export function parseI64Mode(value: unknown = "bigint"): I64Mode {
  if (value !== "number" && value !== "bigint") {
    throw new Error(`Invalid i64 mode ${JSON.stringify(value)}. Expected number or bigint.`);
  }
  return value;
}
