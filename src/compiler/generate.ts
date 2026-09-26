import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadSchema } from "./load-schema.ts";
import { validateSchema } from "./validate-schema.ts";
import { compilerVersion, generateJavaScript } from "./run-thrift.ts";
import { emitModels } from "./emit-models.ts";
import { publishOutput } from "./publish-output.ts";

export interface GenerateOptions {
  input: string;
  output: string;
  includes?: string[];
  namespaces?: string[];
  compiler?: string;
}

export interface GenerateResult {
  compilerVersion: string;
  modules: string[];
  output: string;
}

export async function generate(options: GenerateOptions): Promise<GenerateResult> {
  const input = path.resolve(options.input);
  const output = path.resolve(options.output);
  const includes = [input, ...(options.includes ?? []).map((root) => path.resolve(root))];
  const compiler = options.compiler ?? "thrift";
  const version = await compilerVersion(compiler);
  const schema = await loadSchema(input, includes, options.namespaces);
  for (const program of schema.programs) {
    const relative = path.relative(output, program.filename);
    if (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
      throw new Error(`Output would contain input source: ${program.filename}`);
    }
  }
  validateSchema(schema);
  const models = schema.programs.map((program) => ({
    name: program.name,
    content: emitModels(program),
  }));
  await publishOutput(output, async (staging) => {
    const js = path.join(staging, "internal");
    const types = path.join(staging, "models");
    await mkdir(js);
    await mkdir(types);
    await generateJavaScript(compiler, schema, includes, js);
    await writeFile(path.join(js, "package.json"), '{"type":"commonjs"}\n');
    for (const model of models)
      await writeFile(path.join(types, `${model.name}.ts`), model.content);
    const metadata = schema.programs.map(({ path: sourcePath, name, ast }) => ({
      path: sourcePath,
      name,
      ast,
    }));
    await writeFile(path.join(staging, "metadata.json"), JSON.stringify(metadata, null, 2) + "\n");
    await writeFile(
      path.join(staging, "generation.json"),
      JSON.stringify(
        {
          compilerVersion: version,
          generator: "js:node,bigint",
          namespaces: schema.roots.map((root) => root.name),
        },
        null,
        2,
      ) + "\n",
    );
  });
  return { compilerVersion: version, modules: models.map((model) => model.name), output };
}
