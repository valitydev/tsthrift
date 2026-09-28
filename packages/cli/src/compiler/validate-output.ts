import type { Schema } from "./load-schema.ts";

const reserved = new Set(
  "await break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield let static implements interface package private protected public".split(
    " ",
  ),
);

/** Rejects names that would overwrite generated paths or collide in public barrels. */
export function validateOutput(schema: Schema, services: boolean): void {
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
    const names = new Set<string>(["metadata", "globalThis", "TextEncoder", "Promise"]);
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
      for (const generated of [name, `${name}Config`, `${name}Descriptor`, `create${name}`])
        add(generated);
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
      for (const method of Object.values(service.functions)) {
        for (const arg of method.args) {
          if (reserved.has(arg.name))
            throw new Error(`Unsupported argument identifier: ${arg.name}`);
        }
      }
    }
  }
}
