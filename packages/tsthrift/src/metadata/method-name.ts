/** JS method name for an IDL method; shared by the runtime client and the code generator. */
export function thriftMethodName(name: string, lowerCaseMethods: boolean): string {
  return lowerCaseMethods && name.length > 0 ? name.charAt(0).toLowerCase() + name.slice(1) : name;
}
