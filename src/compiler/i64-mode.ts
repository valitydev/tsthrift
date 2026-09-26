export type I64Mode = "number" | "bigint";

export function parseI64Mode(value: unknown = "number"): I64Mode {
  if (value !== "number" && value !== "bigint") {
    throw new Error(`Invalid i64 mode ${JSON.stringify(value)}. Expected number or bigint.`);
  }
  return value;
}
