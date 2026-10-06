import type { Schema } from "./schema.ts";
import { thriftMethodName } from "@vality/tsthrift";
import { reservedWords } from "./identifiers.ts";

/** Rejects names that would overwrite generated paths or collide in public barrels. */
export function validateOutput(schema: Schema, services: boolean, lowerCaseMethods = false): void {
  const modules = new Set<string>();
  const programs = schema.localPrograms ?? schema.programs;
  for (const program of programs) {
    if (modules.has(program.name.toLowerCase()))
      throw new Error(`Generated module path collision: ${program.name}`);
    modules.add(program.name.toLowerCase());
    if (
      reservedWords.has(program.name) ||
      [
        "loadThriftMetadata",
        "loadThriftMetadataByNamespaces",
        "THRIFT_NAMESPACES",
        "THRIFT_SERVICES",
        "THRIFT_SERVICES_LIST",
      ].includes(program.name)
    ) {
      throw new Error(`Module name collides with generated export: ${program.name}`);
    }
    const names = new Set<string>([
      "TSTHRIFT_BUILD",
      "globalThis",
      "TextEncoder",
      "Promise",
      "loadThriftMetadata",
      "loadThriftMetadataByNamespaces",
      "thriftMetadata",
      "THRIFT_NAMESPACES",
      "THRIFT_SERVICES",
      "THRIFT_SERVICES_LIST",
    ]);
    const add = (name: string) => {
      if (reservedWords.has(name) || names.has(name))
        throw new Error(`Generated identifier collision: ${program.name}.${name}`);
      names.add(name);
    };
    for (const alias of program.includes.keys()) add(alias);
    for (const kind of ["typedef", "enum", "struct", "union", "exception", "const"] as const) {
      for (const name of Object.keys(program.ast[kind] ?? {})) add(name);
    }
    if (!services) continue;
    const paths = new Set(["index"]);
    for (const [name, service] of Object.entries(program.ast.service ?? {})) {
      if (paths.has(name.toLowerCase()))
        throw new Error(`Generated service path collision: ${program.name}.${name}`);
      paths.add(name.toLowerCase());
      for (const generated of [name, `${name}Errors`, `create${name}`]) {
        add(generated);
      }
      if (
        [
          "models",
          "createLazyMetadataClient",
          "ServiceClientConfig",
          "ThriftServiceDescriptor",
          "loadThriftMetadata",
          "loadThriftMetadataByNamespaces",
        ].includes(name)
      ) {
        throw new Error(`Generated service identifier collision: ${program.name}.${name}`);
      }
      const seenMethods = new Set<string>();
      for (const method of Object.values(service.functions)) {
        const methodName = thriftMethodName(method.name, lowerCaseMethods);
        if (seenMethods.has(methodName)) {
          throw new Error(
            `Service method name collision in ${program.name}.${name}: "${methodName}"`,
          );
        }
        seenMethods.add(methodName);
        const capMethodName = method.name.charAt(0).toUpperCase() + method.name.slice(1);
        add(`${name}${capMethodName}Error`);
        if (method.throws && method.throws.length > 0) {
          add(`${name}${capMethodName}ServiceError`);
        }
      }
    }
  }
}
