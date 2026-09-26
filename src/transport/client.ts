import thrift from "thrift";
import { ThriftProtocolError } from "./errors.ts";
import { createHttpTransport } from "./http-transport.ts";
import type { RequestOptions, ThriftClientConfig, TransportFunction } from "./types.ts";

const { TBinaryProtocol, TBufferedTransport } = thrift;

export interface ThriftClientInstance {
  _seqid: number;
  _reqs: Record<number, (error: unknown, result?: unknown) => void>;
  seqid(): number;
  new_seqid(): number;
  output: unknown;
  pClass: unknown;
  [key: string]: unknown;
}

export type ThriftClientConstructor<T = unknown> = new (
  outputTransport: unknown,
  protocolClass: unknown,
) => T;

/**
 * Creates a strongly-typed Thrift service client connected to an HTTP transport.
 */
export function createThriftClient<T extends object>(
  ClientClass: ThriftClientConstructor<T>,
  config: ThriftClientConfig,
  customTransport?: TransportFunction,
): T {
  const transport = customTransport ?? createHttpTransport(config);
  const pendingOptions = new Map<number, RequestOptions | undefined>();

  let clientInstance: ThriftClientInstance;

  // The output transport buffers RPC message bytes and flushes them over HTTP
  const outputTransport = new TBufferedTransport(undefined, (requestBytes: Buffer) => {
    const seqid = clientInstance.seqid();
    const options = pendingOptions.get(seqid);

    // Execute HTTP POST transport
    transport(new Uint8Array(requestBytes), options)
      .then((responseBytes) => {
        TBufferedTransport.receiver((inputTransport: unknown) => {
          const inputProtocol = new TBinaryProtocol(inputTransport);
          const header = inputProtocol.readMessageBegin();

          const recvMethodName = `recv_${header.fname}`;
          const recvMethod = clientInstance[recvMethodName];
          if (typeof recvMethod !== "function") {
            throw new ThriftProtocolError(
              `Client received response for unknown method: "${header.fname}"`,
            );
          }

          // Delegate parsing and Promise resolution to the generated client recv method
          recvMethod.call(clientInstance, inputProtocol, header.mtype, header.rseqid);
        })(Buffer.from(responseBytes));
      })
      .catch((error: unknown) => {
        // Deterministically clean up and reject the pending promise on any error
        const callback = clientInstance._reqs[seqid];
        delete clientInstance._reqs[seqid];
        if (callback) {
          callback(error);
        }
      })
      .finally(() => {
        pendingOptions.delete(seqid);
      });
  });

  const rawClient = new ClientClass(
    outputTransport,
    TBinaryProtocol,
  ) as unknown as ThriftClientInstance;
  clientInstance = rawClient;

  // Wrap client with a Proxy to intercept calls and capture per-call RequestOptions
  return new Proxy(rawClient as unknown as T, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);
      if (typeof prop !== "string" || typeof original !== "function") {
        return original;
      }
      if (
        prop.startsWith("send_") ||
        prop.startsWith("recv_") ||
        prop.endsWith("_seqid") ||
        prop === "seqid"
      ) {
        return original;
      }

      return function (...args: unknown[]) {
        const lastArg = args[args.length - 1];
        let callArgs = args;

        // Check if the last argument is RequestOptions (has signal, headers, or timeoutMs)
        if (
          lastArg &&
          typeof lastArg === "object" &&
          ("signal" in lastArg || "headers" in lastArg || "timeoutMs" in lastArg)
        ) {
          const expectedSeqid = clientInstance._seqid + 1;
          pendingOptions.set(expectedSeqid, lastArg as RequestOptions);
          callArgs = args.slice(0, -1);
        }

        return (original as Function).apply(target, callArgs);
      };
    },
  });
}
