import { describe, expect, test } from "vite-plus/test";
import { createMetadataLoader } from "../src/index.ts";
import type { Metadata } from "../src/index.ts";

describe("createMetadataLoader", () => {
  const metaA: Metadata = {
    name: "a",
    path: "a.thrift",
    ast: { struct: { A: [] } },
  };

  const metaB: Metadata = {
    name: "b",
    path: "b.thrift",
    ast: { struct: { B: [] } },
  };

  test("loads single module and returns array of Metadata", async () => {
    const loader = createMetadataLoader({
      a: () => Promise.resolve({ metadata: metaA }),
    });

    const result = await loader("a");
    expect(result).toEqual([metaA]);
  });

  test("loads multiple modules and unwraps default or metadata exports", async () => {
    const loader = createMetadataLoader({
      combo: () => Promise.resolve([{ metadata: metaA }, { default: metaB }]),
    });

    const result = await loader("combo");
    expect(result).toEqual([metaA, metaB]);
  });

  test("memoizes promises for identical namespace calls", async () => {
    let callCount = 0;
    const loader = createMetadataLoader({
      a: () => {
        callCount++;
        return Promise.resolve(metaA);
      },
    });

    const p1 = loader("a");
    const p2 = loader("a");
    expect(p1).toBe(p2);

    const res = await p1;
    expect(res).toEqual([metaA]);
    expect(callCount).toBe(1);
  });

  test("rejects for unknown namespaces", async () => {
    const loader = createMetadataLoader({});
    await expect(loader("unknown")).rejects.toThrow("Unknown metadata namespace: unknown");
  });
});
