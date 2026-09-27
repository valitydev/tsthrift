import { BinaryReader } from "../runtime/binary-reader.ts";
import { BinaryWriter } from "../runtime/binary-writer.ts";
import { MessageType } from "../runtime/wire.ts";
import { ThriftError, ThriftProtocolError } from "./errors.ts";
import { createHttpTransport } from "./http-transport.ts";
import type { RequestOptions, HttpTransportConfig, TransportFunction } from "./types.ts";
import { type Codec, i32, string } from "../codecs/scalar.ts";
import { struct } from "../codecs/struct.ts";

export type RpcClientConfig = Pick<
  HttpTransportConfig,
  "endpoint" | "headers" | "timeoutMs" | "fetch" | "loggingFn"
> & { transport?: TransportFunction };

export interface MethodCodec {
  args: Codec<Record<string, unknown>>;
  argumentNames: string[];
  result: Codec<Record<string, unknown>>;
  exceptions: string[];
  returns: boolean;
  oneway: boolean;
}

export class ThriftApplicationError extends ThriftError {
  constructor(
    message: string,
    public readonly code: number,
  ) {
    super(message);
  }
}

const applicationException = struct("TApplicationException", () => [
  { id: 1, name: "message", codec: string },
  { id: 2, name: "type", codec: i32 },
]);

function decodeReply(bytes: Uint8Array, name: string, sequenceId: number, method: MethodCodec) {
  const reader = new BinaryReader(bytes);
  const header = reader.readMessageBegin();
  if (header.name !== name || header.sequenceId !== sequenceId)
    throw new ThriftProtocolError("Response method or sequence ID mismatch");
  if (header.type === MessageType.Exception) {
    const error = applicationException.read(reader);
    reader.assertDone();
    throw new ThriftApplicationError(
      error.message ?? "Thrift application exception",
      error.type ?? 0,
    );
  }
  if (header.type !== MessageType.Reply) throw new ThriftProtocolError("Expected Thrift reply");
  const result = method.result.read(reader);
  reader.assertDone();
  const present = Object.keys(result);
  if (present.length > 1) throw new ThriftProtocolError("Multiple fields in RPC result");
  for (const exception of method.exceptions) {
    if (Object.hasOwn(result, exception)) throw result[exception];
  }
  if (!method.returns) return undefined;
  if (!Object.hasOwn(result, "success"))
    throw new ThriftApplicationError(`${name}: missing result`, 5);
  return result.success;
}

/** Creates independent request envelopes; no callback registry or shared request options. */
export function createRpcClient<T extends object>(
  methods: Record<string, MethodCodec>,
  config: RpcClientConfig,
  serviceName: string,
  namespace: string,
): T {
  const transport = config.transport ?? createHttpTransport(config);
  let sequence = 0;
  const entries = Object.entries(methods).map(([name, method]) => [
    name,
    async (...args: unknown[]) => {
      const options = args[method.argumentNames.length] as RequestOptions | undefined;
      const callArgs = args.slice(0, method.argumentNames.length);
      const context = { name, serviceName, namespace, args: callArgs, headers: options?.headers };
      try {
        config.loggingFn?.({ ...context, type: "call" });
        sequence = sequence === 2147483647 ? 1 : sequence + 1;
        const sequenceId = sequence;
        const writer = new BinaryWriter();
        writer.writeMessageBegin(
          name,
          method.oneway ? MessageType.Oneway : MessageType.Call,
          sequenceId,
        );
        method.args.write(
          writer,
          Object.fromEntries(method.argumentNames.map((arg, i) => [arg, callArgs[i]])),
        );
        const bytes = await transport(writer.finish(), options);
        const response = method.oneway ? undefined : decodeReply(bytes, name, sequenceId, method);
        config.loggingFn?.({ ...context, type: "success", response });
        return response;
      } catch (error) {
        config.loggingFn?.({ ...context, type: "error", error });
        throw error;
      }
    },
  ]);
  return Object.fromEntries(entries) as T;
}
