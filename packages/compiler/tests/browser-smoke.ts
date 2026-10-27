import { createMetadataClient } from "@vality/tsthrift";
// The smoke runner resolves this package to its built dist, as a consumer bundler would.
import { compileSources } from "@vality/tsthrift-compiler";

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

  const emitted = await compileSources(
    {
      "proto/example.thrift":
        'include "shared/common.thrift"\nservice Example { string echo(1: common.Id value) }',
      "dependency/shared/common.thrift": "typedef string Id",
    },
    { entries: ["proto/example.thrift"], includeRoots: ["dependency"], emit: true },
  );
  const paths = emitted.files.map((file) => file.path);
  for (const expected of ["example/models.ts", "example/services/Example.ts", "common/models.ts"]) {
    if (!paths.includes(expected)) throw new Error(`Missing emitted file ${expected}`);
  }
  const service = emitted.files.find((file) => file.path === "example/services/Example.ts");
  if (!service?.content.includes("createExample")) throw new Error("Service factory not emitted");
  return `Chromium passed: in-memory compile, call, and ${paths.length} emitted files.`;
}
