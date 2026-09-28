#!/usr/bin/env node
import { parseArgs } from "node:util";
import { generate } from "./compiler/generate.ts";
import { parseI64Mode } from "./compiler/i64-mode.ts";

const help = `Usage: tsthrift --input <directory> --output <directory> [options]

Generate metadata, TypeScript models, and service factories.

  -i, --input            Directory containing entry .thrift files
  -o, --output           Dedicated generated output directory
  -I, --include          Additional include root (repeatable)
  -n, --namespace        Entry filename without .thrift (repeatable; default: all)
      --no-models        Generate only metadata.json without models or services
      --no-services      Generate models and metadata without service factories
      --minify           Minify emitted metadata JSON files
      --split-metadata   Emit per-module metadata files in metadata/
      --metadata-json    Emit monolithic metadata.json in output directory
      --bundle           Compile and bundle generated TypeScript into dist/
      --package          Emit package.json and tsconfig.json in output directory
      --package-name     Name for emitted package.json (default: root package.json or output dir basename)
      --package-version  Version for emitted package.json (default: root package.json or 0.0.0)
      --i64             Public i64 representation: bigint (default) | number
      --allow-duplicate-modules Allow duplicate module basenames across includes (first-wins)
  -h, --help            Show this help

Output is an intermediate generation artifact or standalone protocol package.
`;

try {
  const { values } = parseArgs({
    options: {
      input: { type: "string", short: "i" },
      output: { type: "string", short: "o" },
      include: { type: "string", short: "I", multiple: true },
      namespace: { type: "string", short: "n", multiple: true },
      "no-models": { type: "boolean" },
      "no-services": { type: "boolean" },
      minify: { type: "boolean" },
      "split-metadata": { type: "boolean" },
      "metadata-json": { type: "boolean" },
      bundle: { type: "boolean" },
      package: { type: "boolean" },
      "package-name": { type: "string" },
      "package-version": { type: "string" },
      i64: { type: "string" },
      "allow-duplicate-modules": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) console.log(help);
  else {
    if (!values.input || !values.output)
      throw new Error("--input and --output are required. Use --help for usage.");
    const models = values["no-models"] ? false : true;
    const services = values["no-services"] ? false : undefined;
    const result = await generate({
      input: values.input,
      output: values.output,
      includes: values.include,
      namespaces: values.namespace,
      models,
      services,
      bundle: values.bundle,
      minify: values.minify,
      splitMetadata: values["split-metadata"],
      metadataJson: values["metadata-json"],
      package: values.package,
      packageName: values["package-name"],
      packageVersion: values["package-version"],
      i64: parseI64Mode(values.i64),
      allowDuplicateModules: values["allow-duplicate-modules"],
    });
    console.log(`generated ${result.modules.length} module(s) in ${result.output}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
