import { validateExternalBuild } from "./validate-external-build.ts";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadSchema } from "./load-schema.ts";
import { validateOutput } from "./validate-output.ts";
import { validateSchema } from "./validate-schema.ts";
import { emitModels } from "./emit-models.ts";
import { emitProgramServices } from "./emit-services.ts";
import { emitProgramIndex, emitServicesRegistry } from "./emit-service-registry.ts";
import { emitMetadata } from "../metadata/emit-metadata.ts";
import { canonicalOutputPath, validateOwnedOutput } from "./output-ownership.ts";
import { publishOutput } from "./publish-output.ts";
import {
  emitMetadataLoader,
  emitModuleMetadata,
  emitNamespaceMetadataLoader,
} from "../metadata/emit-split-metadata.ts";
import { parseI64Mode } from "./i64-mode.ts";
import type { I64Mode } from "./i64-mode.ts";
import { bundleOutput } from "./bundle.ts";
import {
  type ExternalNamespaceConfig,
  normalizeExternalNamespaces,
} from "./external-namespaces.ts";

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
  allowDuplicateModules?: boolean;
  main?: string;
}

export interface GenerateResult {
  i64: I64Mode;
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
  const shouldEmitModels = options.models ?? true;
  const shouldEmitServices = shouldEmitModels && options.services !== false;
  const lowerCaseMethods = Boolean(options.lowerCaseMethods);
  const i64 = parseI64Mode(options.i64);

  const externalNamespaces = options.external
    ? normalizeExternalNamespaces(options.external)
    : undefined;
  const schema = await loadSchema(
    input,
    includes,
    options.allowDuplicateModules,
    externalNamespaces,
  );
  const canonicalOutput = await canonicalOutputPath(output);
  const canonicalDist = options.bundle ? await canonicalOutputPath(dist) : dist;
  for (const program of schema.localPrograms) {
    const relative = path.relative(canonicalOutput, program.filename);
    if (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
      throw new Error(`Output would contain input source: ${program.filename}`);
    }
  }
  validateSchema(schema);
  if (shouldEmitModels) validateOutput(schema, shouldEmitServices, lowerCaseMethods);
  if (options.bundle && !shouldEmitModels) throw new Error("--bundle requires models");
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
    await validateExternalBuild(schema, path.dirname(output), i64, lowerCaseMethods);

  await validateOwnedOutput(output);
  if (options.bundle) await validateOwnedOutput(dist);

  const models = shouldEmitModels
    ? schema.localPrograms.map((program) => ({
        name: program.name,
        content: emitModels(program, i64),
      }))
    : [];

  const hasServices =
    shouldEmitServices &&
    schema.localPrograms.some((p) => p.ast.service && Object.keys(p.ast.service).length > 0);

  const isBundled = Boolean(options.bundle && shouldEmitModels);
  await publishOutput(output, async (staging) => {
    if (shouldEmitModels) {
      await writeFile(
        path.join(staging, "build.ts"),
        `export const TSTHRIFT_BUILD: { readonly metadataVersion: 1; readonly i64: ${JSON.stringify(i64)}; readonly lowerCaseMethods: ${lowerCaseMethods} } = ${JSON.stringify({ metadataVersion: 1, i64, lowerCaseMethods })};\n`,
      );
      for (const program of schema.localPrograms) {
        const programDir = path.join(staging, program.name);
        await mkdir(programDir, { recursive: true });

        const model = models.find((m) => m.name === program.name);
        if (model) {
          await writeFile(path.join(programDir, "models.ts"), model.content);
        }

        const meta = emitModuleMetadata(program, undefined, { i64, lowerCaseMethods });
        await writeFile(path.join(programDir, "metadata.ts"), meta.content);

        const loadMeta = emitNamespaceMetadataLoader(program);
        await writeFile(path.join(programDir, "load-metadata.ts"), loadMeta);

        const hasProgramServices =
          shouldEmitServices &&
          Boolean(program.ast.service && Object.keys(program.ast.service).length > 0);

        if (hasProgramServices) {
          const servicesDir = path.join(programDir, "services");
          await mkdir(servicesDir, { recursive: true });
          const serviceFiles = emitProgramServices(program, i64, lowerCaseMethods);
          for (const file of serviceFiles) {
            await writeFile(path.join(servicesDir, file.relativePath), file.content);
          }
          await writeFile(path.join(servicesDir, "index.ts"), emitProgramIndex(program));
        }

        const programIndexLines = [
          "// Generated by tsthrift. Do not edit.",
          'export * from "./models.js";',
          'export { TSTHRIFT_BUILD } from "../build.js";',
          'export { thriftMetadata } from "./metadata.js";',
          'export { loadThriftMetadata } from "./load-metadata.js";',
        ];
        if (hasProgramServices) {
          programIndexLines.push('export * from "./services/index.js";');
        }
        await writeFile(path.join(programDir, "index.ts"), `${programIndexLines.join("\n")}\n`);
      }

      await writeFile(path.join(staging, "metadata.ts"), emitMetadataLoader(schema));

      if (hasServices) {
        await writeFile(path.join(staging, "services.ts"), emitServicesRegistry(schema));
      }

      const rootIndexLines = [
        "// Generated by tsthrift. Do not edit.",
        'export { TSTHRIFT_BUILD } from "./build.js";',
      ];
      const mainProgramName =
        options.main ??
        (schema.localPrograms.length === 1 ? schema.localPrograms[0]?.name : undefined);

      if (mainProgramName) {
        const mainProgram = schema.localPrograms.find((p) => p.name === mainProgramName);
        if (!mainProgram) {
          throw new Error(
            `Main module "${mainProgramName}" not found in schema. Available: ${schema.localPrograms.map((p) => p.name).join(", ")}`,
          );
        }
        rootIndexLines.push(`export * from "./${mainProgram.name}/index.js";`);
      }

      if (hasServices) {
        rootIndexLines.push(
          'export { THRIFT_SERVICES, THRIFT_SERVICES_LIST } from "./services.js";',
        );
      }
      rootIndexLines.push('export { loadThriftMetadata } from "./metadata.js";');
      if (schema.externalPrograms.length > 0) {
        rootIndexLines.push(
          'export { EXTERNAL_NAMESPACES } from "./metadata.js";',
          'export type { ExternalNamespaceDescriptor } from "./metadata.js";',
        );
      }
      await writeFile(path.join(staging, "index.ts"), `${rootIndexLines.join("\n")}\n`);

      const tsconfig = {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          declaration: true,
          isolatedDeclarations: true,
          strict: true,
          skipLibCheck: true,
          resolveJsonModule: true,
        },
      };
      await writeFile(
        path.join(staging, "tsconfig.json"),
        JSON.stringify(tsconfig, null, 2) + "\n",
      );
    }

    const shouldEmitMetadataJson = options.metadataJson ?? !shouldEmitModels;
    if (shouldEmitMetadataJson) {
      await writeFile(path.join(staging, "metadata.json"), emitMetadata(schema));
    }
    if (isBundled) {
      const entries = [
        path.join(staging, "index.ts"),
        ...schema.localPrograms.map((p) => path.join(staging, p.name, "index.ts")),
      ];
      const externalPackages = Array.from(
        new Set(
          schema.externalPrograms
            .flatMap((p) => [p.external?.package, p.external?.importPath, p.external?.metadataPath])
            .filter((pkg): pkg is string => Boolean(pkg)),
        ),
      );
      await publishOutput(dist, async (stagingDist) => {
        await bundleOutput({
          entry: entries,
          outDir: stagingDist,
          tsconfig: path.join(staging, "tsconfig.json"),
          cwd: path.dirname(output),
          sourcemap: options.sourcemap,
          externalPackages,
        });
      });
    }
  });

  return {
    i64,
    models: shouldEmitModels,
    services: shouldEmitServices,
    lowerCaseMethods,
    bundled: isBundled,
    modules: schema.localPrograms.map((program) => program.name),
    externalModules: schema.externalPrograms.map((program) => program.name),
    output,
    dist: isBundled ? dist : undefined,
  };
}
