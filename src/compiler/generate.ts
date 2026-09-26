import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadSchema } from "./load-schema.ts";
import { validateSchema } from "./validate-schema.ts";
import { compilerVersion, generateJavaScript } from "./run-thrift.ts";
import { emitModels } from "./emit-models.ts";
import { publishOutput } from "./publish-output.ts";
import { emitMetadata } from "../metadata/emit-metadata.ts";
import { validateApache } from "./validate-apache.ts";

export type GenerateTarget = "metadata" | "models" | "apache";

export interface GenerateOptions {
  input: string;
  output: string;
  includes?: string[];
  namespaces?: string[];
  compiler?: string;
  target?: GenerateTarget;
}

export interface GenerateResult {
  target: GenerateTarget;
  compilerVersion?: string;
  modules: string[];
  output: string;
}

export async function generate(options: GenerateOptions): Promise<GenerateResult> {
  const input = path.resolve(options.input);
  const output = path.resolve(options.output);
  const includes = [input, ...(options.includes ?? []).map((root) => path.resolve(root))];
  const compiler = options.compiler ?? "thrift";
  const target = options.target ?? "models";
  if (!["metadata", "models", "apache"].includes(target))
    throw new Error(`Unknown generation target: ${target}`);
  if (options.compiler && target !== "apache")
    throw new Error("--compiler requires --target apache");
  const schema = await loadSchema(input, includes, options.namespaces);
  for (const program of schema.programs) {
    const relative = path.relative(output, program.filename);
    if (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
      throw new Error(`Output would contain input source: ${program.filename}`);
    }
  }
  validateSchema(schema);
  const version = target === "apache" ? await compilerVersion(compiler) : undefined;
  if (target === "apache") validateApache(schema);
  const models =
    target === "metadata"
      ? []
      : schema.programs.map((program) => ({
          name: program.name,
          content: emitModels(program),
        }));
  await publishOutput(output, async (staging) => {
    if (target === "apache") {
      const js = path.join(staging, "internal");
      await mkdir(js);
      await generateJavaScript(compiler, schema, includes, js);
      await writeFile(path.join(js, "package.json"), '{"type":"commonjs"}\n');
    }
    if (target !== "metadata") {
      const types = path.join(staging, "models");
      await mkdir(types);
      for (const model of models)
        await writeFile(path.join(types, `${model.name}.ts`), model.content);
    }
    await writeFile(path.join(staging, "metadata.json"), emitMetadata(schema));
    await writeFile(
      path.join(staging, "generation.json"),
      JSON.stringify(
        {
          compilerVersion: version,
          target,
          ...(target === "apache" ? { generator: "js:node,bigint" } : {}),
          namespaces: schema.roots.map((root) => root.name),
        },
        null,
        2,
      ) + "\n",
    );
  });
  return {
    target,
    compilerVersion: version,
    modules: schema.programs.map((program) => program.name),
    output,
  };
}
