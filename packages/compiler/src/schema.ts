import type { Metadata } from "@vality/tsthrift";
import type { ExternalNamespaceConfig } from "./external-namespaces.ts";

export interface Program extends Metadata {
  filename: string;
  includes: Map<string, Program>;
  external?: ExternalNamespaceConfig;
  /** Read from an installed package's metadata rather than a `.thrift` file. */
  fromPackage?: true;
}

export interface Schema {
  roots: Program[];
  programs: Program[];
  localPrograms: Program[];
  externalPrograms: Program[];
}
