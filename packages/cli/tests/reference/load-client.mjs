import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createMetadataClient } from "@vality/tsthrift/native";

export async function loadClient(directory, mode, backend) {
  if (backend === "metadata") {
    const metadata = JSON.parse(await readFile(`${directory}/metadata.json`, "utf8"));
    return {
      createExampleClient: (config) =>
        createMetadataClient({
          ...config,
          metadata,
          namespace: "example",
          serviceName: "Example",
          i64Mode: mode,
        }),
    };
  }
  const { example, SERVICES } = await import(pathToFileURL(`${directory}/clients/index.js`));
  const { types } = await import(pathToFileURL(`${directory}/codecs/example.js`));
  const model = await import(pathToFileURL(`${directory}/models/example.js`));
  return { ...example, SERVICES, types, model };
}
