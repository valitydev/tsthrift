import { expect, test } from "vite-plus/test";
import { createMetadataClient } from "@vality/tsthrift";
import type { Metadata } from "@vality/tsthrift";
import { BinaryReader, BinaryWriter, MessageType } from "@vality/tsthrift/runtime";
import {
  compileSources,
  emitProject,
  programsFromMetadata,
  resolveProjectOptions,
} from "../src/index.ts";

const sources = {
  "child.thrift": `include "base.thrift"
    include "other.thrift"
    service Child { base.Base echo(1: base.Base value) }`,
};

async function externalMetadata(): Promise<Metadata[]> {
  const { metadata } = await compileSources({
    "base.thrift": 'include "common.thrift"\nstruct Base { 1: required common.Id id }',
    "other.thrift": 'include "common.thrift"\nstruct Other { 1: common.Id id }',
    "common.thrift": 'include "identifier.thrift"\ntypedef identifier.Id Id',
    "identifier.thrift": "typedef string Id",
    "unused.thrift": "struct Unused {}",
  });
  return metadata;
}

test.each(["memory", "json"] as const)(
  "calls a client with transitive external dependencies from %s metadata",
  async (format) => {
    const compiled = await compileSources(sources, { external: await externalMetadata() });
    const metadata =
      format === "memory"
        ? compiled.metadata
        : (JSON.parse(
            emitProject(compiled.schema, resolveProjectOptions({ models: false }))[0]!.content,
          ) as Metadata[]);
    expect(metadata.map((item) => item.name).sort()).toEqual([
      "base",
      "child",
      "common",
      "identifier",
      "other",
    ]);
    const client = await createMetadataClient<{
      echo(value: { id: string }): Promise<{ id: string }>;
    }>({
      metadata,
      ...compiled.client,
      namespace: "child",
      serviceName: "Child",
      endpoint: "unused",
      transport: async (bytes) => {
        const reader = new BinaryReader(bytes);
        const header = reader.readMessageBegin();
        expect(header.name).toBe("echo");
        expect(reader.readFieldBegin()).toEqual({ type: 12, id: 1 });
        expect(reader.readFieldBegin()).toEqual({ type: 11, id: 1 });
        const id = reader.readString();
        expect(reader.readFieldBegin().type).toBe(0);
        expect(reader.readFieldBegin().type).toBe(0);
        reader.assertDone();
        const writer = new BinaryWriter();
        writer.writeMessageBegin(header.name, MessageType.Reply, header.sequenceId);
        writer.writeFieldBegin(12, 0);
        writer.writeFieldBegin(11, 1);
        writer.writeString(`${id}!`);
        writer.writeFieldStop();
        writer.writeFieldStop();
        return writer.finish();
      },
    });
    expect(await client.echo({ id: "hello" })).toEqual({ id: "hello!" });
  },
);

test.each(["base", "common", "identifier"])(
  "rejects an unsupported metadata version in external module %s",
  async (name) => {
    const pool = await externalMetadata();
    // @ts-expect-error Published JSON may carry a version unsupported by this compiler.
    pool.find((item) => item.name === name)!.metadataVersion = 999;
    await expect(compileSources(sources, { external: pool })).rejects.toThrow(
      "Unsupported metadata version",
    );
    expect(() => programsFromMetadata("base", pool, { importPath: "base" }, "base")).toThrow(
      "Unsupported metadata version",
    );
  },
);

test("accepts unversioned legacy external metadata", async () => {
  const pool = await externalMetadata();
  for (const item of pool) delete item.metadataVersion;
  const { metadata } = await compileSources(sources, { external: pool });
  expect(metadata.map((item) => item.name).sort()).toEqual([
    "base",
    "child",
    "common",
    "identifier",
    "other",
  ]);
  expect(metadata.every((item) => item.metadataVersion === 1)).toBe(true);
});
