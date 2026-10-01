import type { BinaryMode } from "@vality/tsthrift";
import type { Schema } from "./load-schema.ts";
import type { I64Mode } from "./i64-mode.ts";
import { importFromPackage } from "./resolve-package.ts";

/** Rejects incompatible installed protocol packages before publishing a bundle. */
export async function validateExternalBuild(
  schema: Schema,
  directory: string,
  i64: I64Mode,
  lowerCaseMethods: boolean,
  binary: BinaryMode,
): Promise<void> {
  const checked = new Set<string>();
  for (const program of schema.externalPrograms) {
    const specifier = program.external!.importPath;
    if (checked.has(specifier)) continue;
    checked.add(specifier);
    const module = await importFromPackage(specifier, directory);
    const build = module.TSTHRIFT_BUILD as
      | { metadataVersion?: number; i64?: string; lowerCaseMethods?: boolean; binary?: string }
      | undefined;
    if (
      !build ||
      build.metadataVersion !== 1 ||
      build.i64 !== i64 ||
      build.lowerCaseMethods !== lowerCaseMethods ||
      (build.binary ?? "uint8array") !== binary
    ) {
      throw new TypeError(
        `Incompatible or missing TSTHRIFT_BUILD in external package ${specifier}`,
      );
    }
  }
}
