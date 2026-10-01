import { applyCallSite, callContexts, takeCallSite } from "./call-context.ts";
import { emitLog, toLogError } from "./logging.ts";
import { THRIFT_METHOD_ARGUMENT_COUNT } from "./method-arguments.ts";
import { BinaryReader } from "../runtime/binary-reader.ts";
import { BinaryWriter } from "../runtime/binary-writer.ts";
import { MessageType } from "../runtime/wire.ts";
import {
  ThriftApplicationError,
  ThriftProtocolError,
  ThriftServiceError,
  isThriftError,
} from "./errors.ts";
import { createHttpTransport } from "./http-transport.ts";
import { type HttpTransportConfig, type RequestOptions, type TransportFunction } from "./types.ts";
import { type Codec, i32, string } from "../codecs/scalar.ts";
import { struct } from "../codecs/struct.ts";

export type RpcClientConfig = HttpTransportConfig & { transport?: TransportFunction };

export interface MethodException {
  name: string;
  type: string;
}

export interface MethodCodec {
  wireName?: string;
  args: Codec<Record<string, unknown>>;
  argumentNames: string[];
  result: Codec<Record<string, unknown>>;
  exceptions: MethodException[];
  returns: boolean;
  oneway: boolean;
}

export { ThriftApplicationError };

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
    if (Object.hasOwn(result, exception.name)) {
      throw new ThriftServiceError(
        exception.type,
        exception.name,
        result[exception.name] as object,
      );
    }
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
  const transport = config.transport ?? createHttpTransport({ serviceName, ...config });
  let sequence = 0;
  const entries = Object.entries(methods).map(([name, method]) => [
    name,
    async (...args: unknown[]) => {
      const callSite = takeCallSite();
      const options = args[method.argumentNames.length] as RequestOptions | undefined;
      const callArgs = args.slice(0, method.argumentNames.length);
      const wireName = method.wireName ?? name;
      const correlation: { traceId?: string } = {};
      const started = performance.now();
      sequence = sequence === 2147483647 ? 1 : sequence + 1;
      const sequenceId = sequence;
      const context = {
        name,
        wireName,
        serviceName,
        namespace,
        sequenceId,
        ...(config.logPayloads ? { args: callArgs } : {}),
      };
      try {
        emitLog(config.loggingFn, { ...context, type: "call", durationMs: 0 });
        const writer = new BinaryWriter();
        writer.writeMessageBegin(
          wireName,
          method.oneway ? MessageType.Oneway : MessageType.Call,
          sequenceId,
        );
        method.args.write(
          writer,
          Object.fromEntries(method.argumentNames.map((arg, i) => [arg, callArgs[i]])),
        );
        const request = writer.finish();
        callContexts.set(request, correlation);
        const bytes = await transport(request, options);
        const response = method.oneway
          ? undefined
          : decodeReply(bytes, wireName, sequenceId, method);
        emitLog(config.loggingFn, {
          ...context,
          traceId: correlation.traceId,
          type: "success",
          durationMs: performance.now() - started,
          ...(config.logPayloads ? { response } : {}),
        });
        return response;
      } catch (error) {
        const durationMs = performance.now() - started;
        if (isThriftError(error)) {
          applyCallSite(error, callSite);
          error.context = {
            serviceName,
            namespace,
            method: name,
            sequenceId,
            durationMs,
            traceId: correlation.traceId,
          };
        }
        emitLog(config.loggingFn, {
          ...context,
          traceId: correlation.traceId,
          type: "error",
          durationMs,
          error: toLogError(error, config.logPayloads),
        });
        throw error;
      }
    },
  ]);
  for (const [name, call] of entries) {
    Object.defineProperty(call, THRIFT_METHOD_ARGUMENT_COUNT, {
      value: methods[name as string]!.argumentNames.length,
    });
  }
  const client = Object.fromEntries(entries) as T;
  return client;
}
