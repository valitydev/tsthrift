#!/usr/bin/env node
import { parseArgs } from "node:util";
import { generate } from "./compiler/generate.ts";
import { parseI64Mode } from "./compiler/i64-mode.ts";

const help = `Usage: tsthrift --input <directory> --output <directory> [options]

Generate metadata and public TS models without an external compiler.

  -i, --input       Directory containing entry .thrift files
  -o, --output      Dedicated generated output directory
  -I, --include     Additional include root (repeatable)
  -n, --namespace   Entry filename without .thrift (repeatable; default: all)
      --target     metadata | models (default) | apache
      --i64        Public i64 representation: number (default) | bigint
      --compiler   Apache 0.24.0 executable (only with --target apache)
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
      compiler: { type: "string" },
      target: { type: "string", default: "models" },
      i64: { type: "string", default: "number" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) console.log(help);
  else {
    if (!values.input || !values.output)
      throw new Error("--input and --output are required. Use --help for usage.");
    const target = values.target;
    if (target !== "metadata" && target !== "models" && target !== "apache") {
      throw new Error(`Unknown target ${target}. Expected metadata, models, or apache.`);
    }
    const result = await generate({
      input: values.input,
      output: values.output,
      includes: values.include,
      namespaces: values.namespace,
      compiler: values.compiler,
      target,
      i64: parseI64Mode(values.i64),
    });
    console.log(
      `${result.compilerVersion ?? result.target}: generated ${result.modules.length} module(s) in ${result.output}`,
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
