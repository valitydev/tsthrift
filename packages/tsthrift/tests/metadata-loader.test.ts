import { describe, expect, test, vi } from "vite-plus/test";
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
    // @ts-expect-error An empty dependency map has no valid namespace names.
    await expect(loader("unknown")).rejects.toThrow("Unknown metadata namespace: unknown");
  });

  test("loads only selected namespaces and deduplicates overlapping dependencies", async () => {
    const a = vi.fn().mockResolvedValue([metaA, metaB]);
    const b = vi.fn().mockResolvedValue(metaB);
    const unused = vi.fn();
    const load = createMetadataLoader({ a, b, unused });
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();

    const [result, single] = await Promise.all([load(["a", "b", "a"] as const), load("a")]);
    expect(result).toEqual([metaA, metaB]);
    expect(single).toEqual([metaA, metaB]);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(unused).not.toHaveBeenCalled();
    expect(await load(["b", "a"])).toEqual([metaB, metaA]);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  test("returns an empty result for an explicit empty selection", async () => {
    const a = vi.fn();
    const load = createMetadataLoader({ a });
    expect(await load([])).toEqual([]);
    expect(a).not.toHaveBeenCalled();
  });

  test("rejects unknown namespaces in a selection", async () => {
    const load = createMetadataLoader({ a: async () => metaA });
    // @ts-expect-error Unknown names are rejected statically and at runtime.
    await expect(load(["a", "missing"])).rejects.toThrow("Unknown metadata namespace: missing");
  });

  test("retries failed selected loads while keeping successful namespace loads cached", async () => {
    const a = vi.fn().mockResolvedValue(metaA);
    const b = vi.fn().mockRejectedValueOnce(new Error("temporary")).mockResolvedValue(metaB);
    const cache = new Map<string, Promise<Metadata[]>>();
    const load = createMetadataLoader({ a, b }, { cache });
    await expect(load(["a", "b"])).rejects.toThrow("temporary");
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
    expect(await load(["a", "b"])).toEqual([metaA, metaB]);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });

  test("requires an explicit namespace selection at runtime", async () => {
    const a = vi.fn();
    const load = createMetadataLoader({ a });
    // @ts-expect-error A root loader requires an explicit namespace selection.
    await expect(load()).rejects.toThrow("Expected a namespace string or an array");
    // @ts-expect-error Every selected namespace must be a string.
    await expect(load(["a", 42])).rejects.toThrow("Expected a namespace string or an array");
    expect(a).not.toHaveBeenCalled();
  });

  test("prefers the root selector over a main namespace loader in external modules", async () => {
    const root = vi.fn().mockResolvedValue([metaB]);
    const main = vi.fn().mockResolvedValue([metaA]);
    const load = createMetadataLoader({
      b: async () => ({ loadThriftMetadataByNamespaces: root, loadThriftMetadata: main }),
    });
    expect(await load("b")).toEqual([metaB]);
    expect(root).toHaveBeenCalledWith("b");
    expect(main).not.toHaveBeenCalled();
  });
});
