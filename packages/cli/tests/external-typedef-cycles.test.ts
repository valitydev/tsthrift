import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vite-plus/test";
import { generate } from "../src/index.ts";

test("rejects a real typedef cycle across external metadata modules", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "tsthrift-external-cycle-"));
  try {
    const pkg = path.join(directory, "node_modules/@vality/cycle-proto");
    await mkdir(pkg, { recursive: true });
    await writeFile(
      path.join(pkg, "package.json"),
      JSON.stringify({ type: "module", exports: { "./alpha": "./alpha.mjs" } }),
    );
    const metadata = [
      {
        metadataVersion: 1,
        name: "alpha",
        path: "alpha.thrift",
        ast: {
          include: { beta: { path: "beta.thrift" } },
          typedef: { ID: { type: "beta.ID" } },
        },
      },
      {
        metadataVersion: 1,
        name: "beta",
        path: "beta.thrift",
        ast: {
          include: { alpha: { path: "alpha.thrift" } },
          typedef: { ID: { type: "alpha.ID" } },
        },
      },
    ];
    await writeFile(
      path.join(pkg, "alpha.mjs"),
      `export const loadThriftMetadata = async () => ${JSON.stringify(metadata)};`,
    );
    const input = path.join(directory, "child.thrift");
    await writeFile(input, 'include "alpha.thrift"\nstruct Child { 1: alpha.ID id }');
    await expect(
      generate({
        input,
        output: path.join(directory, "generated"),
        external: ["@vality/cycle-proto"],
      }),
    ).rejects.toThrow("Circular typedef");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
