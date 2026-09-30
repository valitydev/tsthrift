import type { I64Mode } from "@vality/tsthrift";

export function accountSet(mode: I64Mode, empty = false) {
  const integer = (value: bigint) => (mode === "number" ? Number(value) : value);
  return {
    name: "System accounts",
    description: "",
    accounts: new Map(
      empty
        ? []
        : [
            [{ symbolic_code: "EUR" }, { settlement: integer(101n), subagent: integer(0n) }],
            [{ symbolic_code: "USD" }, { settlement: integer(202n) }],
          ],
    ),
  };
}

export function payload(mode: I64Mode, empty = false) {
  const integer = (value: bigint) => (mode === "number" ? Number(value) : value);
  const minimum = mode === "number" ? -9007199254740991n : -(1n << 63n);
  const maximum = mode === "number" ? 9007199254740991n : (1n << 63n) - 1n;
  return {
    flag: false,
    small: empty ? 0 : -128,
    medium: empty ? 0 : 32767,
    integer: empty ? 0 : -2147483648,
    large: integer(empty ? 0n : minimum),
    fraction: empty ? 0 : -123.25,
    text: empty ? "" : "Hello, Привет 🚀\u0000",
    bytes: empty ? new Uint8Array() : Uint8Array.from({ length: 256 }, (_, i) => i),
    state: 7,
    identifiers: empty ? [] : [integer(0n), integer(minimum), integer(maximum)],
    currencies: new Set(empty ? [] : [{ symbolic_code: "EUR" }, { symbolic_code: "USD" }]),
    values: new Map<unknown, unknown>(
      empty
        ? []
        : [
            [{ str: "first" }, { arr: [{ nl: {} }, { b: false }, { i: integer(maximum) }] }],
            [
              { str: "second" },
              {
                obj: new Map<unknown, unknown>([
                  [{ str: "binary" }, { bin: new Uint8Array([0, 255]) }],
                  [{ str: "double" }, { flt: 0.5 }],
                ]),
              },
            ],
          ],
    ),
    accounts: accountSet(mode, empty),
    present: {},
    alias_byte: 0,
  };
}

export function commitValues(mode: I64Mode) {
  const version = mode === "number" ? 42 : 42n;
  const data = accountSet(mode);
  const object = { system_account_set: { ref: { id: 17 }, data } };
  return {
    args: [version, [{ update: { object } }], "local-conformance-author"],
    result: { version, new_objects: new Set([object]) },
  };
}

export function largeCommitValues(mode: I64Mode) {
  const integer = (value: bigint) => (mode === "number" ? Number(value) : value);
  const version = integer(1000n);
  const objects: Array<{
    system_account_set: {
      ref: { id: number };
      data: {
        name: string;
        description: string;
        accounts: Map<
          { symbolic_code: string },
          { settlement: number | bigint; subagent?: number | bigint }
        >;
      };
    };
  }> = [];
  const operations: Array<{ update: { object: (typeof objects)[number] } }> = [];

  for (let i = 0; i < 50; i++) {
    const accounts = new Map<
      { symbolic_code: string },
      { settlement: number | bigint; subagent?: number | bigint }
    >([
      [
        { symbolic_code: "EUR" },
        { settlement: integer(BigInt(10000 + i * 10 + 1)), subagent: integer(BigInt(i)) },
      ],
      [{ symbolic_code: "USD" }, { settlement: integer(BigInt(10000 + i * 10 + 2)) }],
      [{ symbolic_code: "RUB" }, { settlement: integer(BigInt(10000 + i * 10 + 3)) }],
      [{ symbolic_code: "GBP" }, { settlement: integer(BigInt(10000 + i * 10 + 4)) }],
    ]);
    const data = {
      name: `System accounts batch #${i}`,
      description: `Batch commit object with UTF-8: Привет 🚀 ${i}`,
      accounts,
    };
    const object = {
      system_account_set: {
        ref: { id: 1000 + i },
        data,
      },
    };
    objects.push(object);
    operations.push({ update: { object } });
  }

  return {
    args: [version, operations, "local-conformance-author"],
    result: { version, new_objects: new Set(objects) },
  };
}
