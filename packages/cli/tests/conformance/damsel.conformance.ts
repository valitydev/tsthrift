import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, afterEach, beforeAll, expect, test } from "vite-plus/test";
import {
  BinaryWriter,
  type I64Mode,
  MessageType,
  type Metadata,
  MetadataIndex,
  type TransportFunction,
} from "@vality/tsthrift";
import { createConformanceDirectory, prepareConformance } from "./setup.ts";
import { commitValues, largeCommitValues, payload } from "./values.ts";

let directory: string;
let environment: Awaited<ReturnType<typeof prepareConformance>>;
let suiteFailed = false;

afterEach((context) => {
  if (context.task.result?.state === "fail") {
    suiteFailed = true;
  }
});

beforeAll(async () => {
  directory = await createConformanceDirectory();
  environment = await prepareConformance(directory);
  console.log(
    `[Conformance Suite] Active reference: variant=${environment.variant}, compiler=${environment.compilerVersion}, Java=${environment.javaRuntime}, Damsel=${environment.revision}`,
  );
});

afterAll(async () => {
  const preserve =
    suiteFailed ||
    process.env.KEEP_CONFORMANCE_OUTPUT === "1" ||
    !!process.env.CONFORMANCE_OUTPUT_DIR;
  if (preserve) {
    console.log(`[Conformance Suite] Artifacts preserved for diagnostics at: ${directory}`);
  } else if (directory) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function generated(mode: I64Mode, filename: string) {
  return import(pathToFileURL(path.join(directory, mode, filename)).href);
}

async function transport(scenario: string): Promise<TransportFunction> {
  await environment.oracle("reference", scenario, directory);
  const expected = await readFile(path.join(directory, `${scenario}.request.bin`));
  return async (bytes) => {
    expect(Buffer.from(bytes)).toEqual(expected);
    const request = path.join(directory, `${scenario}.native.bin`);
    const reply = path.join(directory, `${scenario}.processed.bin`);
    await writeFile(request, bytes);
    await environment.oracle("process", scenario, request, reply);
    const result = await readFile(reply);
    expect(result).toEqual(await readFile(path.join(directory, `${scenario}.reply.bin`)));
    return new Uint8Array(result);
  };
}

async function verifyReplyEncoding(
  mode: I64Mode,
  scenario: string,
  metadata: Metadata[],
  namespace: string,
  service: string,
  methodName: string,
  result: unknown,
  exception = false,
) {
  // Load non-public test subjects at runtime, outside the CLI declaration build graph.
  const { MetadataCodecs } = await import(
    new URL("../../../tsthrift/src/metadata/codecs.ts", import.meta.url).href
  );
  const { struct } = await import(
    new URL("../../../tsthrift/src/codecs/struct.ts", import.meta.url).href
  );
  const index = new MetadataIndex(metadata);
  const resolved = index.getMethod(namespace, service, methodName)!;
  const fields = exception
    ? resolved.method.throws
    : [{ id: 0, name: "success", type: resolved.method.type }];
  const codecs = new MetadataCodecs(index, mode);
  const codec = struct("result", () => codecs.fields(fields, resolved.namespace));
  const writer = new BinaryWriter();
  writer.writeMessageBegin(methodName, MessageType.Reply, 1);
  codec.write(writer, { [exception ? fields[0]!.name : "success"]: result });
  expect(Buffer.from(writer.finish())).toEqual(
    await readFile(path.join(directory, `${scenario}.reply.bin`)),
  );
}

test.each(["bigint", "number"] as const)(
  "all supported types and composite keys match generated Java (%s)",
  async (mode) => {
    const { createEcho } = await generated(mode, "alpha/services/Echo.js");
    const { loadThriftMetadataByNamespaces } = await generated(mode, "metadata.js");
    for (const empty of [false, true]) {
      const scenario = `${empty ? "empty" : "all"}-${mode}`;
      // Explicit mode isolates wire conformance from the generated factory mode.
      const client = createEcho({
        endpoint: "unused",
        transport: await transport(scenario),
      });
      const value = payload(mode, empty);
      const result = await client.echo(value);
      expect(result).toEqual(value);
      expect(result.accounts.accounts.size).toBe(empty ? 0 : 2);
      expect(result.values.size).toBe(empty ? 0 : 2);
      expect(Object.hasOwn(result, "present")).toBe(true);
      expect(Object.hasOwn(result, "absent")).toBe(false);
      await verifyReplyEncoding(
        mode,
        scenario,
        await loadThriftMetadataByNamespaces("alpha"),
        "alpha",
        "Echo",
        "echo",
        result,
      );
    }
  },
);

test.each(["bigint", "number"] as const)(
  "latest Damsel Repository.Commit round-trips CurrencyRef map keys (%s)",
  async (mode) => {
    const scenario = `damsel-${mode}`;
    const { createRepository } = await generated(
      mode,
      "damsel/domain_config_v2/services/Repository.js",
    );
    const { loadThriftMetadataByNamespaces } = await generated(mode, "damsel/metadata.js");
    const client = createRepository({
      endpoint: "unused",
      transport: await transport(scenario),
    });
    const value = commitValues(mode);
    const result = await client.Commit(...value.args);
    expect(result).toEqual(value.result);
    const [object] = result.new_objects;
    expect([...object.system_account_set.data.accounts.keys()]).toEqual([
      { symbolic_code: "EUR" },
      { symbolic_code: "USD" },
    ]);
    await verifyReplyEncoding(
      mode,
      scenario,
      await loadThriftMetadataByNamespaces("domain_config_v2"),
      "domain_config_v2",
      "Repository",
      "Commit",
      result,
    );
  },
);

test.each(["bigint", "number"] as const)(
  "large Damsel Repository.Commit with 50 domain objects round-trips via Java Processor (%s)",
  async (mode) => {
    const scenario = `damsel-large-${mode}`;
    const { createRepository } = await generated(
      mode,
      "damsel/domain_config_v2/services/Repository.js",
    );
    const { loadThriftMetadataByNamespaces } = await generated(mode, "damsel/metadata.js");
    const client = createRepository({
      endpoint: "unused",
      transport: await transport(scenario),
    });
    const value = largeCommitValues(mode);
    const result = await client.Commit(...value.args);
    expect(result).toEqual(value.result);
    expect(result.new_objects.size).toBe(50);
    await verifyReplyEncoding(
      mode,
      scenario,
      await loadThriftMetadataByNamespaces("domain_config_v2"),
      "domain_config_v2",
      "Repository",
      "Commit",
      result,
    );
  },
);

test.each(["bigint", "number"] as const)(
  "declared exception matches generated Java (%s)",
  async (mode) => {
    const scenario = `failure-${mode}`;
    const { createEcho } = await generated(mode, "alpha/services/Echo.js");
    const { loadThriftMetadataByNamespaces } = await generated(mode, "metadata.js");
    const client = createEcho({
      endpoint: "unused",
      transport: await transport(scenario),
    });
    const failure = { code: 409, reason: "declared failure" };
    await expect(client.echo(payload(mode))).rejects.toMatchObject({
      type: "alpha.Failure",
      data: failure,
      isService: true,
    });
    await verifyReplyEncoding(
      mode,
      scenario,
      await loadThriftMetadataByNamespaces("alpha"),
      "alpha",
      "Echo",
      "echo",
      failure,
      true,
    );
  },
);

test("same service and IDL namespace names remain isolated by source module", async () => {
  const { THRIFT_SERVICES, loadThriftMetadataByNamespaces } = await generated("bigint", "index.js");
  const metadata: Metadata[] = await loadThriftMetadataByNamespaces("beta");
  const alphaMetadata: Metadata[] = await loadThriftMetadataByNamespaces("alpha");
  expect(metadata[0]!.ast.namespace?.js).toEqual(alphaMetadata[0]!.ast.namespace?.js);
  const alpha = THRIFT_SERVICES["alpha.Echo"].createService({
    endpoint: "unused",
    transport: await transport("all-bigint"),
  });
  const beta = THRIFT_SERVICES["beta.Echo"].createService({
    endpoint: "unused",
    transport: await transport("beta"),
  });
  const sameName = THRIFT_SERVICES["alpha.alpha"].createService({
    endpoint: "unused",
    transport: await transport("alpha"),
  });
  const results = await Promise.all([
    alpha.echo(payload("bigint")),
    beta.echo({ value: 73 }),
    sameName.echo("same-name"),
  ]);
  expect(results).toEqual([payload("bigint"), { value: 73 }, "same-name"]);
});

test.each(["notify", "fire"])("void/oneway %s uses the official envelope", async (method) => {
  const { createEcho } = await generated("bigint", "alpha/services/Echo.js");
  const client = createEcho({ endpoint: "unused", transport: await transport(method) });
  await expect(client[method]("")).resolves.toBeUndefined();
});
