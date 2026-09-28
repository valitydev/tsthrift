export { BinaryReader } from "./runtime/binary-reader.ts";
export type { BinaryReaderOptions } from "./runtime/binary-reader.ts";
export { BinaryWriter } from "./runtime/binary-writer.ts";
export { i64ToNumber, numberToI64 } from "./runtime/i64.ts";
export {
  BINARY_VERSION_1,
  BINARY_VERSION_MASK,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_COLLECTION_SIZE,
  DEFAULT_MAX_DEPTH,
  MessageType,
  WireType,
} from "./runtime/wire.ts";
export type { MessageTypeValue, WireTypeValue } from "./runtime/wire.ts";
export { binaryToString, isBinary, toBinary } from "./runtime/binary-converter.ts";
export type { BinaryEncoding } from "./runtime/binary-converter.ts";
export { formatUuid, isUuid, parseUuid } from "./runtime/uuid.ts";
