import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vite-plus/test";
import { verifyBrowserBundle } from "./native-browser.ts";
import { generate } from "../src/index.ts";

const exec = promisify(execFile);
const execute = async (file: string, args: string[]) => {
  try {
    return await exec(file, args);
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    throw new Error(`${failure.message}\n${failure.stdout ?? ""}\n${failure.stderr ?? ""}`);
  }
};
const tsc = path.resolve(
  path.dirname(createRequire(import.meta.url).resolve("typescript")),
  "../bin/tsc",
);

test.each(["bigint", "number"] as const)(
  "executes native %s client from metadata against Apache wire codecs",
  async (i64) => {
    const directory = await mkdtemp(path.join(tmpdir(), "tsthrift-native-"));
    try {
      const input = path.join(directory, "proto");
      const output = path.join(directory, "generated");
      await mkdir(input);
      await symlink(
        path.resolve(import.meta.dirname, "../node_modules"),
        path.join(directory, "node_modules"),
        "dir",
      );
      await writeFile(path.join(directory, "package.json"), '{"type":"module"}');
      await writeFile(
        path.join(input, "base.thrift"),
        `
      struct Key { 1: required i64 id 2: required string name }
      struct Empty {}
      enum State { START = 3 READY }
      struct Node { 1: optional Node next 2: optional string text = "default" 3: optional State state = State.READY }
      exception Failure { 1: string reason }
      service Example { void duplicateName() }
      service Parent { string inherited(1: string callback) }
    `,
      );
      await writeFile(
        path.join(input, "middle.thrift"),
        `
      include "base.thrift"
      typedef base.Key KeyAlias
      typedef map<KeyAlias, set<i64>> Mapping
    `,
      );
      await writeFile(
        path.join(input, "example.thrift"),
        `
      include "middle.thrift"
      include "base.thrift"
      struct Payload {
        1: required middle.Mapping values
        2: optional base.Empty empty
        3: optional binary bytes
        4: optional base.Node node
      }
      const binary BYTES = "abc"
      union Choice { 1: string text 2: i64 integer }
      service Example extends base.Parent {
        Payload exchange(1: Payload options, 2: string callback, 3: i32 params) throws (1: base.Failure failure)
        void notify(1: string message)
        oneway void fire(1: string message)
        i64 numeric(1: i64 value)
      }
    `,
      );
      await generate({
        input,
        output,
        i64,
        namespaces: ["example"],
        metadataJson: true,
      });
      const compiled = path.join(directory, "compiled");
      await execute(process.execPath, [
        tsc,
        "--ignoreConfig",
        "--strict",
        "--skipLibCheck",
        "--target",
        "es2022",
        "--module",
        "nodenext",
        "--resolveJsonModule",
        "--outDir",
        compiled,
        path.join(output, "index.ts"),
      ]);
      await copyFile(path.join(output, "metadata.json"), path.join(compiled, "metadata.json"));
      for (const [script, kind] of [
        ["native-client.mjs", "client"],
        ["native-http.mjs", "HTTP"],
      ]) {
        const dynamic = await execute(process.execPath, [
          path.join(import.meta.dirname, "reference", script),
          compiled,
          i64,
          "metadata",
        ]);
        expect(dynamic.stdout.trim()).toBe(`metadata ${kind} checks passed`);
      }
      const entry = path.join(directory, "metadata-entry.ts");
      await writeFile(
        entry,
        `import { createMetadataClient } from "@vality/tsthrift";
        import metadata from "./generated/metadata.json";
        export function createExampleClient(config) { return createMetadataClient({ ...config, metadata, namespace: "example", serviceName: "Example", i64Mode: "${i64}" }); }`,
      );
      await verifyBrowserBundle(output, entry);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  30_000,
);
