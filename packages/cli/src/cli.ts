#!/usr/bin/env node
import { parseArgs } from "node:util";
import { generate } from "./compiler/generate.ts";
import { parseI64Mode } from "./compiler/i64-mode.ts";

const help = `Usage: tsthrift --input <path/glob> [options]

Generate metadata, TypeScript models, and service factories.

  -i, --input            Thrift file, directory, or glob pattern (repeatable)
  -o, --output           Generated TypeScript source directory (default: generated)
      --bundle           Compile and bundle generated TypeScript into distribution directory
  -d, --dist             Bundle output directory (default: dist)
      --no-sourcemap     Disable source maps when bundling
  -I, --include          Additional include root (repeatable)
  -e, --external         External package namespace mapping <ns>=<pkg/path> (repeatable)
  -m, --main             Main namespace to re-export at root (auto if single module)
      --no-models        Generate only metadata.json without models or services
      --no-services      Generate models and metadata without service factories
      --metadata-json    Emit monolithic metadata.json in output directory
      --i64              Public i64 representation: bigint (default) | number
      --lower-case-methods Generate service methods starting with a lowercase letter
      --allow-duplicate-modules Allow duplicate module basenames across includes (first-wins)
  -h, --help             Show this help
`;

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      input: { type: "string", short: "i", multiple: true },
      output: { type: "string", short: "o" },
      bundle: { type: "boolean" },
      dist: { type: "string", short: "d" },
      "no-sourcemap": { type: "boolean" },
      include: { type: "string", short: "I", multiple: true },
      external: { type: "string", short: "e", multiple: true },
      main: { type: "string", short: "m" },
      "no-models": { type: "boolean" },
      "no-services": { type: "boolean" },
      "metadata-json": { type: "boolean" },
      i64: { type: "string" },
      "lower-case-methods": { type: "boolean" },
      "allow-duplicate-modules": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) console.log(help);
  else {
    const inputs = [...(values.input ?? []), ...positionals];
    if (!inputs.length) throw new Error("--input is required. Use --help for usage.");
    const models = values["no-models"] ? false : true;
    const services = values["no-services"] ? false : undefined;
    const sourcemap = values["no-sourcemap"] ? false : undefined;
    const result = await generate({
      input: inputs.length === 1 ? inputs[0]! : inputs,
      output: values.output,
      bundle: values.bundle,
      dist: values.dist,
      sourcemap,
      includes: values.include,
      external: values.external,
      main: values.main,
      models,
      services,
      lowerCaseMethods: values["lower-case-methods"],
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
