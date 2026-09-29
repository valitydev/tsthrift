import type { Schema } from "./load-schema.ts";

const reserved = new Set(
  "await break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield let static implements interface package private protected public".split(
    " ",
  ),
);

function lowerFirst(str: string): string {
  return str.length > 0 ? str.charAt(0).toLowerCase() + str.slice(1) : str;
}

/** Rejects names that would overwrite generated paths or collide in public barrels. */
export function validateOutput(schema: Schema, services: boolean, lowerCaseMethods = false): void {
  const modules = new Set<string>();
  for (const program of schema.programs) {
    if (modules.has(program.name.toLowerCase()))
      throw new Error(`Generated module path collision: ${program.name}`);
    modules.add(program.name.toLowerCase());
    if (
      reserved.has(program.name) ||
      ["loadMetadata", "SERVICES", "SERVICES_LIST"].includes(program.name)
    ) {
      throw new Error(`Module name collides with generated export: ${program.name}`);
    }
    const names = new Set<string>([
      "metadata",
      "globalThis",
      "TextEncoder",
      "Promise",
      "loadMetadata",
      "SERVICES",
      "SERVICES_LIST",
    ]);
    const add = (name: string) => {
      if (reserved.has(name) || names.has(name))
        throw new Error(`Generated identifier collision: ${program.name}.${name}`);
      names.add(name);
    };
    for (const alias of program.includes.keys()) add(alias);
    for (const kind of ["typedef", "enum", "struct", "union", "exception", "const"] as const) {
      for (const name of Object.keys(program.ast[kind] ?? {})) add(name);
    }
    if (Object.keys(program.ast.service ?? {}).length) add("RequestOptions");
    if (!services) continue;
    const paths = new Set(["index"]);
    for (const [name, service] of Object.entries(program.ast.service ?? {})) {
      if (paths.has(name.toLowerCase()))
        throw new Error(`Generated service path collision: ${program.name}.${name}`);
      paths.add(name.toLowerCase());
      for (const generated of [
        name,
        `${name}Safe`,
        `${name}Config`,
        `${name}Descriptor`,
        `create${name}`,
        `create${name}Safe`,
      ]) {
        add(generated);
      }
      if (
        [
          "models",
          "createLazyMetadataClient",
          "MetadataClientConfig",
          "ThriftServiceDescriptor",
          "defaultMetadata",
        ].includes(name)
      ) {
        throw new Error(`Generated service identifier collision: ${program.name}.${name}`);
      }
      const seenMethods = new Set<string>();
      for (const method of Object.values(service.functions)) {
        const methodName = lowerCaseMethods ? lowerFirst(method.name) : method.name;
        if (methodName === "safe") {
          throw new Error(
            `Service method name collides with reserved client property: ${program.name}.${name}.${method.name}`,
          );
        }
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
