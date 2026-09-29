import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createMetadataClient } from "@vality/tsthrift";

export async function loadClient(directory, mode, backend = "metadata") {
  if (backend === "generated" || backend === "descriptor") {
    const root = await import(pathToFileURL(`${directory}/index.js`));
    let exampleModule = root.example;
    if (!exampleModule) {
      try {
        exampleModule = await import(pathToFileURL(`${directory}/example/index.js`));
      } catch {
        exampleModule = root;
      }
    }
    return {
      createExampleClient:
        backend === "descriptor"
          ? root.SERVICES["example.Example"].createService
          : (exampleModule.createExample ?? root.createExample),
      model: exampleModule,
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
