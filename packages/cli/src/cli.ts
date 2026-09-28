#!/usr/bin/env node
import { parseArgs } from "node:util";
import { generate } from "./compiler/generate.ts";
import { parseI64Mode } from "./compiler/i64-mode.ts";

const help = `Usage: tsthrift --input <directory> [options]

Generate metadata, TypeScript models, and service factories.

  -i, --input            Directory containing entry .thrift files
  -o, --output           Generated TypeScript source directory (default: generated)
      --bundle           Compile and bundle generated TypeScript into distribution directory
  -d, --dist             Bundle output directory (default: dist)
  -I, --include          Additional include root (repeatable)
  -n, --namespace        Entry filename without .thrift (repeatable; default: all)
      --no-models        Generate only metadata.json without models or services
      --no-services      Generate models and metadata without service factories
      --metadata-json    Emit monolithic metadata.json in output directory
      --i64              Public i64 representation: bigint (default) | number
      --allow-duplicate-modules Allow duplicate module basenames across includes (first-wins)
  -h, --help             Show this help
`;

try {
  const { values } = parseArgs({
    options: {
      input: { type: "string", short: "i" },
      output: { type: "string", short: "o" },
      bundle: { type: "boolean" },
      dist: { type: "string", short: "d" },
      include: { type: "string", short: "I", multiple: true },
      namespace: { type: "string", short: "n", multiple: true },
      "no-models": { type: "boolean" },
      "no-services": { type: "boolean" },
      "metadata-json": { type: "boolean" },
      i64: { type: "string" },
      "allow-duplicate-modules": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) console.log(help);
  else {
    if (!values.input) throw new Error("--input is required. Use --help for usage.");
    const models = values["no-models"] ? false : true;
    const services = values["no-services"] ? false : undefined;
    const result = await generate({
      input: values.input,
      output: values.output,
      bundle: values.bundle,
      dist: values.dist,
      includes: values.include,
      namespaces: values.namespace,
      models,
      services,
      metadataJson: values["metadata-json"],
      i64: parseI64Mode(values.i64),
      allowDuplicateModules: values["allow-duplicate-modules"],
    });
    if (result.dist) {
      console.log(
        `generated ${result.modules.length} module(s) in ${result.output} and bundled into ${result.dist}`,
      );
    } else {
      console.log(`generated ${result.modules.length} module(s) in ${result.output}`);
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
