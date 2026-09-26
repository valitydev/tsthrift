import { ThriftConverter } from "../converter/index.ts";
import type { Metadata } from "../converter/types.ts";
import type { ThriftClientConstructor, ThriftClientInstance } from "./client.ts";
import type { MetadataModule, RequestOptions, ThriftClientConfig } from "./types.ts";

export interface ProxyContext<T extends object> {
  target: T;
  clientInstance: ThriftClientInstance;
  pendingOptions: Map<number, RequestOptions | undefined>;
  config: ThriftClientConfig;
  ClientClass: ThriftClientConstructor<T>;
}

function unwrapMetadata(raw: MetadataModule): Metadata[] {
  if (Array.isArray(raw)) {
    return raw;
  }
  if (raw && typeof raw === "object" && "default" in raw && Array.isArray(raw.default)) {
    return raw.default;
  }
  return raw as unknown as Metadata[];
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

  const initConverter = (metadata: MetadataModule) => {
    converter = new ThriftConverter({
      metadata: unwrapMetadata(metadata),
      i64Mode: config.i64Mode,
      classRegistry: config.classRegistry,
      index: config.index,
    });
    resolveServiceAndNamespace();
  };

  if (!converter && config.metadata) {
    if (Array.isArray(config.metadata)) {
      initConverter(config.metadata);
    } else if (config.metadata instanceof Promise) {
      initPromise = config.metadata.then(initConverter);
    }
  }

  const ensureReady = (): Promise<void> | undefined => {
    if (converter) return undefined;
    if (initPromise) return initPromise;
    if (typeof config.metadata === "function") {
      const result = config.metadata();
      if (result instanceof Promise) {
        initPromise = result.then(initConverter);
        return initPromise;
      }
      initConverter(result);
      return undefined;
    }
    return undefined;
  };

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

        const waitPromise = ensureReady();
        if (waitPromise) {
          return waitPromise.then(executeCall);
        }
        return executeCall();
      };
    },
  });
}
