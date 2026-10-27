import type { BinaryMode } from "@vality/tsthrift";

export type { BinaryMode };

export function parseBinaryMode(value: unknown = "base64"): BinaryMode {
  if (value !== "base64" && value !== "uint8array") {
    throw new Error(`Invalid binary mode ${JSON.stringify(value)}. Expected base64 or uint8array.`);
  }
  return value;
}
