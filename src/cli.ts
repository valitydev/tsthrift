#!/usr/bin/env node
import { parseArgs } from "node:util";
import { generate } from "./compiler/generate.ts";

const help = `Usage: tsthrift --input <directory> --output <directory> [options]

Generate internal JS clients, public TS models, and metadata.json.
Requires the official Apache Thrift 0.24.0 compiler.

  -i, --input       Directory containing entry .thrift files
  -o, --output      Dedicated generated output directory
  -I, --include     Additional include root (repeatable)
  -n, --namespace   Entry filename without .thrift (repeatable; default: all)
      --compiler   Compiler executable path (default: thrift on PATH)
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
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) console.log(help);
  else {
    if (!values.input || !values.output)
      throw new Error("--input and --output are required. Use --help for usage.");
    const result = await generate({
      input: values.input,
      output: values.output,
      includes: values.include,
      namespaces: values.namespace,
      compiler: values.compiler,
    });
    console.log(
      `${result.compilerVersion}: generated ${result.modules.length} module(s) in ${result.output}`,
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
