import { Buffer as SafeBuffer } from "buffer";

// Ensure Buffer global is available in browser environments for Apache Thrift 0.24
if (typeof globalThis.Buffer === "undefined") {
  (globalThis as any).Buffer = SafeBuffer;
}

export { SafeBuffer as Buffer };
