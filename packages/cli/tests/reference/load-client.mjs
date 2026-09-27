import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createMetadataClient } from "@vality/tsthrift";

export async function loadClient(directory, mode, _backend = "metadata") {
  const metadata = JSON.parse(await readFile(`${directory}/metadata.json`, "utf8"));
  let model;
  try {
    model = await import(pathToFileURL(`${directory}/models/example.js`));
  } catch {}
  const createExample = (config) =>
    createMetadataClient({
      ...config,
      metadata,
      namespace: "example",
      serviceName: "Example",
      i64Mode: mode,
    });
  return {
    createExample,
    createExampleClient: createExample,
    model,
  };
}
