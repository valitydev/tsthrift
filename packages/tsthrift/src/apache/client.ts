import type { ThriftClientConfig } from "./types.ts";
import "./buffer-polyfill.ts";
import thrift from "thrift";
import { createClientProxy } from "./client-proxy.ts";
import { ThriftProtocolError } from "../transport/errors.ts";
import { createHttpTransport } from "../transport/http-transport.ts";
import type { RequestOptions, TransportFunction } from "../transport/types.ts";

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

  return createClientProxy({
    target: rawClient as unknown as T,
    clientInstance,
    pendingOptions,
    config,
    ClientClass,
  });
}
