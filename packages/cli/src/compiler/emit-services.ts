import type { ValueType } from "@vality/tsthrift";
import type { Program, Schema } from "./load-schema.ts";
import type { I64Mode } from "./i64-mode.ts";
import type { BinaryTargetType } from "./emit-models.ts";

export interface EmittedServiceFile {
  programName: string;
  serviceName: string;
  relativePath: string;
  content: string;
}

function serviceTsType(type: ValueType, i64: I64Mode, binary: BinaryTargetType): string {
  if (typeof type !== "string") {
    if (type.name === "map")
      return `globalThis.Map<${serviceTsType(type.keyType, i64, binary)}, ${serviceTsType(type.valueType, i64, binary)}>`;
    return type.name === "set"
      ? `globalThis.Set<${serviceTsType(type.valueType, i64, binary)}>`
      : `${serviceTsType(type.valueType, i64, binary)}[]`;
  }
  if (type === "void") return "void";
  if (type === "string") return "string";
  if (type === "bool") return "boolean";
  if (type === "i64") return i64;
  if (["byte", "i8", "i16", "i32", "double"].includes(type)) return "number";
  if (type === "binary") return binary;
  if (type === "uuid") return "string";
  return `models.${type}`;
}

const reservedWords = new Set(
  "await break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield let static implements interface package private protected public".split(
    " ",
  ),
);

function safeParamName(name: string): string {
  let safe = name;
  while (reservedWords.has(safe)) {
    safe = `_${safe}`;
  }
  return safe;
}

function lowerFirst(str: string): string {
  return str.length > 0 ? str.charAt(0).toLowerCase() + str.slice(1) : str;
}

export function emitProgramServices(
  program: Program,
  i64: I64Mode = "bigint",
  binary: BinaryTargetType = "Uint8Array",
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
        const incTarget = program.includes.get(incNamespace)!.name;
        parentImport = `import type {\n  ${incService} as ${incNamespace}_${incService},\n  ${incService}Errors as ${incNamespace}_${incService}Errors,\n} from "../../${incTarget}/services/${incService}.js";\n`;
        parent = ` extends ${incNamespace}_${incService}`;
        parentErrors = ` extends ${incNamespace}_${incService}Errors`;
      } else {
        parentImport = `import type { ${service.extends}, ${service.extends}Errors } from "./${service.extends}.js";\n`;
        parent = ` extends ${service.extends}`;
        parentErrors = ` extends ${service.extends}Errors`;
      }
    }

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
          (field) => `${safeParamName(field.name)}: ${serviceTsType(field.type, i64, binary)}`,
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
          const typeName = typeStr.includes(".") ? typeStr.split(".").pop()! : typeStr;
          const dataType = serviceTsType(field.type, i64, binary);
          return `ThriftServiceError<${JSON.stringify(typeName)}, ${dataType}>`;
        });
        errorTypes.push(
          `export type ${serviceErrorTypeName} = ${serviceErrors.join(" | ")};`,
          `export type ${errorTypeName} = ${serviceErrorTypeName} | ThriftSystemError;`,
        );
      } else {
        errorTypes.push(`export type ${errorTypeName} = ThriftSystemError;`);
      }

      const returnType = serviceTsType(method.type, i64, binary);
      methods.push(`  ${JSON.stringify(methodName)}(${parameters}): Promise<${returnType}>;`);
    }

    const lines = [
      "// Generated by tsthrift. Do not edit.",
      "import {",
      "  THRIFT_ERRORS,",
      "  THRIFT_RESULT,",
      "  createLazyMetadataClient,",
      "  type MetadataClientConfig,",
      "  type ThriftRequestOptions,",
      "  type ThriftResultClient,",
      "  type ThriftServiceDescriptor,",
      "  type ThriftServiceError,",
      "  type ThriftSystemError,",
      '} from "@vality/tsthrift";',
      'import { loadThriftMetadata } from "../../metadata.js";',
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
      `export interface ${serviceName}Config extends Omit<MetadataClientConfig, "serviceName" | "namespace" | "metadata" | "i64Mode"> {`,
      '  metadata?: MetadataClientConfig["metadata"];',
      "}",
      "",
      `const defaultMetadata = () => loadThriftMetadata(${JSON.stringify(program.name)});`,
      "",
      `/**`,
      ` * Creates a service client for ${serviceName} that lazily initializes metadata and codecs.`,
      ` */`,
      `export function create${serviceName}(config: ${serviceName}Config): ${serviceName} {`,
      `  return createLazyMetadataClient<${serviceName}>({`,
      `    ...config,`,
      `    i64Mode: ${JSON.stringify(i64)},`,
      `    serviceName: ${JSON.stringify(serviceName)},`,
      `    namespace: ${JSON.stringify(program.name)},`,
      ...(lowerCaseMethods ? [`    lowerCaseMethods: true,`] : []),
      `    metadata: config.metadata ?? defaultMetadata,`,
      `  });`,
      `}`,
      "",
      `/**`,
      ` * Thrift service descriptor for ${serviceName}.`,
      ` */`,
      `export const ${serviceName}: ThriftServiceDescriptor<${serviceName}, ${serviceName}Errors> = {`,
      `  serviceName: ${JSON.stringify(serviceName)},`,
      `  namespace: ${JSON.stringify(program.name)},`,
      `  createService: create${serviceName},`,
      `  getMetadata: defaultMetadata,`,
      `};`,
      "",
      `/**`,
      ` * Alias for ${serviceName} descriptor.`,
      ` */`,
      `export const ${serviceName}Descriptor: ThriftServiceDescriptor<${serviceName}, ${serviceName}Errors> = ${serviceName};`,
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

export function emitProgramIndex(program: Program): string {
  const services = Object.keys(program.ast.service ?? {});
  const lines = [
    "// Generated by tsthrift. Do not edit.",
    ...services.map((name) => `export * from "./${name}.js";`),
    "",
  ];
  return lines.join("\n");
}

export function emitServicesRegistry(schema: Schema): string {
  const lines = [
    "// Generated by tsthrift. Do not edit.",
    'import type { ThriftServiceDescriptor } from "@vality/tsthrift";',
  ];

  const serviceList: { programName: string; serviceName: string }[] = [];
  for (const program of schema.programs) {
    for (const serviceName of Object.keys(program.ast.service ?? {})) {
      serviceList.push({ programName: program.name, serviceName });
    }
  }

  for (const s of serviceList) {
    lines.push(
      `import { type ${s.serviceName} as ${s.programName}_${s.serviceName}, ${s.serviceName} as ${s.programName}_${s.serviceName}Descriptor } from "./${s.programName}/services/${s.serviceName}.js";`,
    );
  }

  lines.push("");
  lines.push("export interface ServicesRegistry {");
  for (const s of serviceList) {
    lines.push(
      `  "${s.programName}.${s.serviceName}": ThriftServiceDescriptor<${s.programName}_${s.serviceName}>;`,
    );
  }
  lines.push("}");
  lines.push("export const THRIFT_SERVICES: ServicesRegistry = {");
  for (const s of serviceList) {
    lines.push(
      `  "${s.programName}.${s.serviceName}": ${s.programName}_${s.serviceName}Descriptor,`,
    );
  }

  lines.push("};");
  lines.push("");
  lines.push(
    "export const THRIFT_SERVICES_LIST: ThriftServiceDescriptor[] = Object.values(THRIFT_SERVICES);",
  );
  lines.push("/** Alias for THRIFT_SERVICES. */");
  lines.push("export const SERVICES: ServicesRegistry = THRIFT_SERVICES;");
  lines.push("");
  lines.push("/** Alias for THRIFT_SERVICES_LIST. */");
  lines.push("export const SERVICES_LIST: ThriftServiceDescriptor[] = THRIFT_SERVICES_LIST;");
  lines.push("");

  return lines.join("\n");
}
