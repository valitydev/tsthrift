import { createConverter, type ThriftConverter } from "../converter/index.ts";
import type { ThriftClientConstructor, ThriftClientInstance } from "./client.ts";
import type { RequestOptions, ThriftClientConfig } from "./types.ts";

export interface ProxyContext<T extends object> {
  target: T;
  clientInstance: ThriftClientInstance;
  pendingOptions: Map<number, RequestOptions | undefined>;
  config: ThriftClientConfig;
  ClientClass: ThriftClientConstructor<T>;
}

export function createClientProxy<T extends object>(context: ProxyContext<T>): T {
  const { target, clientInstance, pendingOptions, config, ClientClass } = context;

  let converter: ThriftConverter | undefined = config.converter;
  let initPromise: Promise<void> | undefined;

  let serviceName = config.serviceName ?? ClientClass.name?.replace(/Client$/, "");
  let namespace = config.namespace;

  const resolveServiceAndNamespace = () => {
    if (converter && serviceName && !namespace) {
      const serviceInfo = converter.findService(serviceName, config.namespace);
      if (serviceInfo) {
        namespace = serviceInfo.namespace;
      }
    }
  };

  if (!converter && config.metadata) {
    if (config.metadata instanceof Promise) {
      initPromise = config.metadata.then((loaded) => {
        converter = createConverter({
          metadata: loaded,
          i64Mode: config.i64Mode,
          classRegistry: config.classRegistry,
        });
        resolveServiceAndNamespace();
      });
    } else {
      converter = createConverter({
        metadata: config.metadata,
        i64Mode: config.i64Mode,
        classRegistry: config.classRegistry,
      });
    }
  }

  resolveServiceAndNamespace();

  return new Proxy(target, {
    get(rawTarget, prop, receiver) {
      const original = Reflect.get(rawTarget, prop, receiver);
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

        if (
          lastArg &&
          typeof lastArg === "object" &&
          ("signal" in lastArg || "headers" in lastArg || "timeoutMs" in lastArg)
        ) {
          const expectedSeqid = clientInstance._seqid + 1;
          pendingOptions.set(expectedSeqid, lastArg as RequestOptions);
          callArgs = args.slice(0, -1);
        }

        const executeCall = () => {
          const activeConverter = converter;
          if (activeConverter && namespace && serviceName) {
            const methodInfo = activeConverter.getMethod(namespace, serviceName, prop);
            if (methodInfo) {
              const convertedArgs = callArgs.map((arg, idx) => {
                const fieldDef = methodInfo.method.args[idx];
                if (!fieldDef) return arg;
                return activeConverter.toThriftInstance(arg, fieldDef.type, methodInfo.namespace);
              });

              const result = (original as Function).apply(rawTarget, convertedArgs);
              if (result && typeof (result as Promise<unknown>).then === "function") {
                return (result as Promise<unknown>).then((rawResponse: unknown) => {
                  if (
                    methodInfo.method.type === "void" ||
                    rawResponse === undefined ||
                    rawResponse === null
                  ) {
                    return rawResponse;
                  }
                  return activeConverter.toPlainObject(
                    rawResponse,
                    methodInfo.method.type,
                    methodInfo.namespace,
                  );
                });
              }
              return result;
            }
          }

          return (original as Function).apply(rawTarget, callArgs);
        };

        if (initPromise) {
          return initPromise.then(executeCall);
        }
        return executeCall();
      };
    },
  });
}
