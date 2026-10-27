import { createMetadataClient } from "@vality/tsthrift";
import { compileSources } from "../src/index.ts";

/** Compiles IDL held in memory and calls a server with the resulting metadata, in a browser. */
export async function runCompilerBrowserSmoke(endpoint: string): Promise<string> {
  const { metadata, client: modes } = await compileSources(
    { "example.thrift": "service Example { binary echo(1: binary value, 2: i64 number) }" },
    { i64: "number", binary: "uint8array" },
  );
  const client = await createMetadataClient<{
    echo(value: Uint8Array, number: number, options?: object): Promise<Uint8Array>;
  }>({
    metadata,
    namespace: "example",
    serviceName: "Example",
    endpoint,
    ...modes,
  });
  const bytes = new Uint8Array([0, 128, 255]);
  const result = await client.echo(bytes, 42, { headers: { authorization: "new" } });
  if (!(result instanceof Uint8Array) || String(result) !== String(bytes)) {
    throw new Error("Binary roundtrip through in-memory compiled metadata failed");
  }
  return "Chromium passed: in-memory compile and call.";
}
