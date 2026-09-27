import { build } from "vite";
import vm from "node:vm";
import path from "node:path";
import { expect } from "vite-plus/test";
import { BinaryReader, BinaryWriter, MessageType } from "@vality/tsthrift";

/** Executes a browser-targeted bundle without Node globals or dependencies. */
export async function verifyBrowserBundle(
  output: string,
  entry = path.join(output, "clients/example/Example.ts"),
) {
  const result = await build({
    configFile: false,
    logLevel: "silent",
    build: {
      write: false,
      minify: false,
      lib: {
        entry,
        name: "Generated",
        formats: ["iife"],
      },
    },
  });
  const bundles = Array.isArray(result) ? result : [result];
  if (!("output" in bundles[0])) throw new Error("Expected a completed bundle");
  const chunk = bundles[0].output.find((file) => file.type === "chunk");
  if (!chunk || chunk.type !== "chunk") throw new Error("Missing browser bundle");
  expect(
    Object.keys(chunk.modules).filter((id) => /node_modules\/(thrift|buffer)\//.test(id)),
  ).toEqual([]);
  const context = vm.createContext(
    { Uint8Array, DataView, TextEncoder, TextDecoder, Map, Set, URL, structuredClone },
    { codeGeneration: { strings: false, wasm: false } },
  );
  vm.runInContext(chunk.code, context);
  expect(vm.runInContext("typeof Buffer", context)).toBe("undefined");
  expect(vm.runInContext("typeof process", context)).toBe("undefined");
  const client = await context.Generated.createExampleClient({
    endpoint: "unused",
    transport: async (bytes: Uint8Array) => {
      const reader = new BinaryReader(bytes);
      const header = reader.readMessageBegin();
      reader.readFieldBegin();
      const message = reader.readString();
      const writer = new BinaryWriter();
      writer.writeMessageBegin(header.name, MessageType.Reply, header.sequenceId);
      writer.writeFieldBegin(11, 0);
      writer.writeString(message);
      writer.writeFieldStop();
      return writer.finish();
    },
  });
  expect(await client.inherited("browser bundle")).toBe("browser bundle");
}
