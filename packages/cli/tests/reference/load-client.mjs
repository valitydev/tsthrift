import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createMetadataClient } from "@vality/tsthrift";

export async function loadClient(directory, mode, backend = "metadata") {
  if (backend === "generated" || backend === "descriptor") {
    const root = await import(pathToFileURL(`${directory}/index.js`));
    return {
      createExampleClient:
        backend === "descriptor"
          ? root.SERVICES["example.Example"].createService
          : root.example.createExample,
      model: root.example,
      SERVICES: root.SERVICES,
    };
  }
  const metadata = JSON.parse(await readFile(`${directory}/metadata.json`, "utf8"));
  let model;
  try {
    model = await import(pathToFileURL(`${directory}/example/models.js`));
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
