#!/usr/bin/env node
import { parseArgs } from "node:util";
import { generate } from "./compiler/generate.ts";
import { parseI64Mode } from "./compiler/i64-mode.ts";

const help = `Usage: tsthrift --input <directory> --output <directory> [options]

Generate metadata, TypeScript models, and client factories.

  -i, --input            Directory containing entry .thrift files
  -o, --output           Dedicated generated output directory
  -I, --include          Additional include root (repeatable)
  -n, --namespace        Entry filename without .thrift (repeatable; default: all)
      --no-models        Generate only metadata.json without models or clients
      --no-clients       Generate models and metadata without client factories
      --minify           Minify emitted metadata JSON files
      --split-metadata   Emit per-module metadata files in metadata/
      --metadata-json    Emit monolithic metadata.json in output directory
      --package          Emit package.json and tsconfig.json in output directory
      --package-name     Name for emitted package.json (default: output dir basename)
      --i64             Public i64 representation: bigint (default) | number
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
      "no-clients": { type: "boolean" },
      minify: { type: "boolean" },
      "split-metadata": { type: "boolean" },
      "metadata-json": { type: "boolean" },
      package: { type: "boolean" },
      "package-name": { type: "string" },
      i64: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) console.log(help);
  else {
    if (!values.input || !values.output)
      throw new Error("--input and --output are required. Use --help for usage.");
    const models = values["no-models"] ? false : true;
    const clients = values["no-clients"] ? false : undefined;
    const result = await generate({
      input: values.input,
      output: values.output,
      includes: values.include,
      namespaces: values.namespace,
      models,
      clients,
      minify: values.minify,
      splitMetadata: values["split-metadata"],
      metadataJson: values["metadata-json"],
      package: values.package,
      packageName: values["package-name"],
      i64: parseI64Mode(values.i64),
    });
    console.log(`generated ${result.modules.length} module(s) in ${result.output}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
