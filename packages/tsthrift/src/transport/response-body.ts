import { ThriftProtocolError } from "./errors.ts";

const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

/** Bounds streamed response allocation before binary decoding or error rendering. */
export async function readResponseBody(
  response: Response,
  signal?: AbortSignal,
  maxBytes: number = MAX_RESPONSE_BYTES,
  truncate = false,
): Promise<Uint8Array> {
  const limitError = () => new ThriftProtocolError("HTTP response exceeds 16 MiB limit");
  if (!truncate && Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw limitError();
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const onAbort = () => {
    void reader.cancel(signal?.reason).catch(() => {});
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) onAbort();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      if (truncate && length + value.byteLength >= maxBytes) {
        chunks.push(value.slice(0, maxBytes - length));
        length = maxBytes;
        await reader.cancel().catch(() => {});
        break;
      }
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel().catch(() => {});
        throw limitError();
      }
      chunks.push(value);
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
