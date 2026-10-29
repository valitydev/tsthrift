import parse from "thrift-parser";
import { validateThriftAst } from "@vality/tsthrift";
import type { ThriftAst } from "@vality/tsthrift";

/** Parses one Thrift IDL document into a structurally validated AST. */
export function parseThrift(source: string): ThriftAst {
  const ast: unknown = parse(source);
  validateThriftAst(ast);
  return ast;
}
