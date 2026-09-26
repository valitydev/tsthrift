import type { ThriftAst } from "../metadata/schema.ts";

type Enumeration = NonNullable<ThriftAst["enum"]>[string];

export function enumMembers(enumeration: Enumeration, location: string) {
  let value = -1;
  const names = new Set<string>();
  return enumeration.items.map((item) => {
    if (names.has(item.name)) throw new Error(`Duplicate enum member ${location}.${item.name}`);
    names.add(item.name);
    value = item.value ?? value + 1;
    if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) {
      throw new Error(`Enum value outside i32 range: ${location}.${item.name} = ${value}`);
    }
    return { name: item.name, value };
  });
}
