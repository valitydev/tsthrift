import type { I64Mode } from "./i64-mode.ts";

const integerRanges: Record<string, [number, number]> = {
  byte: [-128, 127],
  i8: [-128, 127],
  i16: [-32768, 32767],
  i32: [-2147483648, 2147483647],
  i64: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
};

export function emitScalarConstant(
  type: string,
  value: unknown,
  location: string,
  i64: I64Mode,
): string {
  const invalid = () =>
    new Error(`Invalid ${type} constant in ${location}: ${JSON.stringify(value)}`);
  const range = integerRanges[type];
  if (range) {
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value < range[0] ||
      value > range[1]
    )
      throw invalid();
  } else if (type === "double") {
    if (typeof value !== "number" || !Number.isFinite(value)) throw invalid();
  } else if (type === "bool") {
    if (value === 0 || value === 1) return value ? "true" : "false";
    if (typeof value !== "boolean") throw invalid();
  } else if (type === "string" || type === "binary" || type === "uuid") {
    if (typeof value !== "string") throw invalid();
  } else throw invalid();
  const literal = JSON.stringify(value);
  return type === "i64" && i64 === "bigint" ? `${literal}n` : literal;
}
