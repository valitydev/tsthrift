import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  emitProject,
  isExternalPackage,
  normalizeExternalNamespaces,
  parseExternalPackage,
  projectEntries,
  resolveProjectOptions,
  validateProject,
} from "@vality/tsthrift-compiler";
import type { BinaryMode, ExternalNamespaceConfig, I64Mode } from "@vality/tsthrift-compiler";
import { compileOutput } from "./compile.ts";
import { loadSchema } from "./load-schema.ts";
import { canonicalOutputPath, validateOwnedOutput } from "./output-ownership.ts";
import { publishOutput } from "./publish-output.ts";
import { validateExternalBuild } from "./validate-external-build.ts";

export interface GenerateOptions {
  input: string | string[];
  output?: string;
  bundle?: boolean;
  dist?: string;
  sourcemap?: boolean;
  includes?: string[];
  external?: Record<string, string | ExternalNamespaceConfig> | string[];
  models?: boolean;
  services?: boolean;
  lowerCaseMethods?: boolean;
  metadataJson?: boolean;
  i64?: I64Mode;
  binary?: BinaryMode;
  allowDuplicateModules?: boolean;
  main?: string;
}

export interface GenerateResult {
  i64: I64Mode;
  binary: BinaryMode;
  models: boolean;
  services: boolean;
  lowerCaseMethods: boolean;
  bundled?: boolean;
  compilerVersion?: string;
  modules: string[];
  externalModules?: string[];
  output: string;
  dist?: string;
}

export async function generate(options: GenerateOptions): Promise<GenerateResult> {
  const input = Array.isArray(options.input)
    ? options.input.map((i) => path.resolve(i))
    : path.resolve(options.input);
  const output = path.resolve(options.output ?? "generated");
  const dist = path.resolve(options.dist ?? "dist");
  const includes = (options.includes ?? []).map((root) => path.resolve(root));
  const project = resolveProjectOptions(options);
  const { i64, binary, lowerCaseMethods } = project;

  const externalNamespaces = options.external
    ? normalizeExternalNamespaces(options.external)
    : undefined;
  const externalPackages = Array.isArray(options.external)
    ? options.external.filter(isExternalPackage).map(parseExternalPackage)
    : [];
  const schema = await loadSchema(
    input,
    includes,
    options.allowDuplicateModules,
    externalNamespaces,
    path.dirname(output),
    externalPackages,
  );
  const canonicalOutput = await canonicalOutputPath(output);
  const canonicalDist = options.bundle ? await canonicalOutputPath(dist) : dist;
  for (const program of schema.localPrograms) {
    const relative = path.relative(canonicalOutput, program.filename);
    if (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
      throw new Error(`Output would contain input source: ${program.filename}`);
    }
  }
  validateProject(schema, project);
  if (options.bundle && !project.models) throw new Error("--bundle requires models");
  if (options.bundle) {
    const overlaps = (a: string, b: string) => {
      const relative = path.relative(a, b);
      return (
        relative === "" ||
        (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
      );
    };
    if (overlaps(canonicalOutput, canonicalDist) || overlaps(canonicalDist, canonicalOutput))
      throw new Error("Source and bundle output directories must not overlap");
    if (schema.localPrograms.some((program) => overlaps(canonicalDist, program.filename)))
      throw new Error("Bundle output would contain input source");
  }

  if (options.bundle)
    await validateExternalBuild(schema, path.dirname(output), i64, lowerCaseMethods, binary);

  await validateOwnedOutput(output);
  if (options.bundle) await validateOwnedOutput(dist);

  const files = emitProject(schema, project);

  const isBundled = Boolean(options.bundle && project.models);
  await publishOutput(output, async (staging) => {
    for (const file of files) {
      const target = path.join(staging, ...file.path.split("/"));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.content);
    }
    if (isBundled) {
      await publishOutput(dist, async (stagingDist) => {
        await compileOutput({
          entries: projectEntries(schema).map((entry) => path.join(staging, ...entry.split("/"))),
          tsconfig: path.join(staging, "tsconfig.json"),
          outDir: stagingDist,
          sourcemap: options.sourcemap,
        });
      });
    }
  });

  return {
    i64,
    binary,
    models: project.models,
    services: project.services,
    lowerCaseMethods,
    bundled: isBundled,
    modules: schema.localPrograms.map((program) => program.name),
    externalModules: schema.externalPrograms.map((program) => program.name),
    output,
    dist: isBundled ? dist : undefined,
  };
}
