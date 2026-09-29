import { resolveReference, resolveType } from "./resolve-type.ts";
import type { Program } from "./load-schema.ts";
import type { I64Mode } from "./i64-mode.ts";
import { lowerFirst, reservedWords } from "./identifiers.ts";
import { tsType } from "./ts-type.ts";

const serviceType = (name: string) => `models.${name}`;

export interface EmittedServiceFile {
  programName: string;
  serviceName: string;
  relativePath: string;
  content: string;
}

function safeParamName(name: string): string {
  let safe = name;
  while (reservedWords.has(safe)) {
    safe = `_${safe}`;
  }
  return safe;
}

export function emitProgramServices(
  program: Program,
  i64: I64Mode = "bigint",
  lowerCaseMethods = false,
): EmittedServiceFile[] {
  const files: EmittedServiceFile[] = [];
  const services = program.ast.service ?? {};

  for (const [serviceName, service] of Object.entries(services)) {
    let parent = "";
    let parentErrors = "";
    let parentImport = "";
    if (service.extends) {
      if (service.extends.includes(".")) {
        const [incNamespace, incService] = service.extends.split(".");
        const incProgram = program.includes.get(incNamespace)!;
        if (incProgram.external) {
          parentImport = `import type {\n  ${incService} as ${incNamespace}_${incService},\n  ${incService}Errors as ${incNamespace}_${incService}Errors,\n} from ${JSON.stringify(incProgram.external.importPath)};\n`;
        } else {
          const incTarget = incProgram.name;
          parentImport = `import type {\n  ${incService} as ${incNamespace}_${incService},\n  ${incService}Errors as ${incNamespace}_${incService}Errors,\n} from "../../${incTarget}/services/${incService}.js";\n`;
        }
        parent = ` extends ${incNamespace}_${incService}`;
        parentErrors = ` extends ${incNamespace}_${incService}Errors`;
      } else {
        parentImport = `import type { ${service.extends}, ${service.extends}Errors } from "./${service.extends}.js";\n`;
        parent = ` extends ${service.extends}`;
        parentErrors = ` extends ${service.extends}Errors`;
      }
    }

    const allMethodNames = new Set<string>();
    const collectMethods = (owner: Program, name: string): void => {
      const definition = owner.ast.service![name]!;
      if (definition.extends) {
        const parent = resolveReference(owner, definition.extends);
        collectMethods(parent.program, parent.name);
      }
      for (const method of Object.values(definition.functions)) {
        allMethodNames.add(lowerCaseMethods ? lowerFirst(method.name) : method.name);
      }
    };
    collectMethods(program, serviceName);
    const errorTypes: string[] = [];
    const errorMembers: string[] = [];
    const methods: string[] = [];

    const seenMethodNames = new Set<string>();
    for (const method of Object.values(service.functions)) {
      const methodName = lowerCaseMethods ? lowerFirst(method.name) : method.name;
      if (seenMethodNames.has(methodName)) {
        throw new Error(
          `Method name collision in service ${program.name}.${serviceName}: "${methodName}"`,
        );
      }
      seenMethodNames.add(methodName);
      const paramNames = new Set(method.args.map((field) => safeParamName(field.name)));
      let optionsName = "options";
      while (paramNames.has(optionsName)) optionsName = `_${optionsName}`;
      const parameters = [
        ...method.args.map(
          (field) => `${safeParamName(field.name)}: ${tsType(field.type, i64, serviceType)}`,
        ),
        `${optionsName}?: ThriftRequestOptions`,
      ].join(", ");

      const capMethodName = method.name.charAt(0).toUpperCase() + method.name.slice(1);
      const serviceErrorTypeName = `${serviceName}${capMethodName}ServiceError`;
      const errorTypeName = `${serviceName}${capMethodName}Error`;
      errorMembers.push(`  ${JSON.stringify(methodName)}: ${errorTypeName};`);

      if (method.throws && method.throws.length > 0) {
        const serviceErrors = method.throws.map((field) => {
          const typeStr = typeof field.type === "string" ? field.type : "";
          const resolved = resolveType(program, typeStr);
          if (typeof resolved.type !== "string")
            throw new TypeError("Expected exception type name");
          const typeName = `${resolved.program.name}.${resolved.type}`;
          const dataType = tsType(field.type, i64, serviceType);
          return `ThriftServiceError<${JSON.stringify(typeName)}, ${dataType}>`;
        });
        errorTypes.push(
          `export type ${serviceErrorTypeName} = ${serviceErrors.join(" | ")};`,
          `export type ${errorTypeName} = ${serviceErrorTypeName} | ThriftSystemError;`,
        );
      } else {
        errorTypes.push(`export type ${errorTypeName} = ThriftSystemError;`);
      }

      const returnType = tsType(method.type, i64, serviceType);
      methods.push(`  ${JSON.stringify(methodName)}(${parameters}): Promise<${returnType}>;`);
    }

    const lines = [
      "// Generated by tsthrift. Do not edit.",
      "import {",
      "  THRIFT_ERRORS,",
      "  THRIFT_RESULT,",
      "  createLazyMetadataClient,",
      "  type MetadataClientConfig,",
      "  type RequestOptions as ThriftRequestOptions,",
      "  type ThriftResultClient,",
      "  type ThriftServiceDescriptor,",
      "  type ThriftServiceError,",
      "  type ThriftSystemError,",
      '} from "@vality/tsthrift";',
      'import { loadThriftMetadata } from "../load-metadata.js";',
      'import type * as models from "../models.js";',
    ];

    if (parentImport) {
      lines.push(parentImport.trim());
    }

    if (errorTypes.length > 0) {
      lines.push("", ...errorTypes);
    }

    lines.push(
      "",
      `/** Method error map for ${serviceName}. */`,
      `export interface ${serviceName}Errors${parentErrors} {`,
      errorMembers.join("\n"),
      "}",
      "",
      `export interface ${serviceName}${parent} {`,
      `  readonly [THRIFT_ERRORS]?: ${serviceName}Errors;`,
      `  readonly [THRIFT_RESULT]: ThriftResultClient<${serviceName}>;`,
      methods.join("\n"),
      "}",
      "",
      `export interface ${serviceName}Config extends Omit<MetadataClientConfig, "serviceName" | "namespace" | "metadata" | "i64Mode" | "lowerCaseMethods"> {`,
      '  metadata?: MetadataClientConfig["metadata"];',
      "}",
      "",
      `/**`,
      ` * Creates a service client for ${serviceName} that lazily initializes metadata and codecs.`,
      ` */`,
      `export function create${serviceName}(config: ${serviceName}Config): ${serviceName} {`,
      `  if (!config) throw new TypeError("Expected service configuration");`,
      `  return createLazyMetadataClient<${serviceName}>({`,
      `    ...config,`,
      `    i64Mode: ${JSON.stringify(i64)},`,
      `    serviceName: ${JSON.stringify(serviceName)},`,
      `    namespace: ${JSON.stringify(program.name)},`,
      `    lowerCaseMethods: ${lowerCaseMethods},`,
      `    metadata: config.metadata ?? loadThriftMetadata,`,
      `  }, ${JSON.stringify([...allMethodNames])});`,
      `}`,
      "",
      `/**`,
      ` * Thrift service descriptor for ${serviceName}.`,
      ` */`,
      `export const ${serviceName}: ThriftServiceDescriptor<${serviceName}, ${serviceName}Errors> = {`,
      `  serviceName: ${JSON.stringify(serviceName)},`,
      `  namespace: ${JSON.stringify(program.name)},`,
      `  createService: create${serviceName},`,
      `  getMetadata: loadThriftMetadata,`,
      `};`,
      "",
    );

    files.push({
      programName: program.name,
      serviceName,
      relativePath: `${serviceName}.ts`,
      content: lines.join("\n"),
    });
  }

  return files;
}
