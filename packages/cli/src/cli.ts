#!/usr/bin/env node
import { parseArgs } from "node:util";
import { generate } from "./compiler/generate.ts";
import { parseI64Mode } from "./compiler/i64-mode.ts";

const help = `Usage: tsthrift --input <directory> --output <directory> [options]

Generate metadata and TypeScript models.

  -i, --input       Directory containing entry .thrift files
  -o, --output      Dedicated generated output directory
  -I, --include     Additional include root (repeatable)
  -n, --namespace   Entry filename without .thrift (repeatable; default: all)
      --no-models   Generate only metadata.json without TypeScript models
      --i64        Public i64 representation: bigint (default) | number
  -h, --help       Show this help

Output is an intermediate generation artifact, not a bundled RPC package.
`;

try {
  const { values } = parseArgs({
    options: {
      input: { type: "string", short: "i" },
      output: { type: "string", short: "o" },
      include: { type: "string", short: "I", multiple: true },
      namespace: { type: "string", short: "n", multiple: true },
      "no-models": { type: "boolean" },
      target: { type: "string" },
      i64: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) console.log(help);
  else {
    if (!values.input || !values.output)
      throw new Error("--input and --output are required. Use --help for usage.");
    const models = values["no-models"] ? false : values.target === "metadata" ? false : true;
    const result = await generate({
      input: values.input,
      output: values.output,
      includes: values.include,
      namespaces: values.namespace,
      models,
      i64: parseI64Mode(values.i64),
    });
    console.log(
      `${result.target}: generated ${result.modules.length} module(s) in ${result.output}`,
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
