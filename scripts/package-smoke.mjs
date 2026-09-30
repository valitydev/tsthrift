import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const directory = await mkdtemp(path.join(tmpdir(), "tsthrift-package-smoke-"));
async function run(command, args, cwd = directory) {
  try {
    return await execute(command, args, { cwd, timeout: 180_000, maxBuffer: 4 * 1024 * 1024 });
  } catch (error) {
    throw new Error(`${error.message}\n${error.stdout ?? ""}\n${error.stderr ?? ""}`);
  }
}
async function json(filename, value) {
  await writeFile(filename, JSON.stringify(value, null, 2) + "\n");
}

try {
  for (const name of ["tsthrift", "cli", "angular"]) {
    await run(
      "vp",
      ["exec", "pnpm", "pack", "--pack-destination", directory],
      path.join(root, "packages", name),
    );
  }
  const archives = (await readdir(directory)).filter((file) => file.endsWith(".tgz"));
  assert.equal(archives.length, 3);
  for (const archive of archives) {
    const { stdout } = await run("tar", ["-tf", path.join(directory, archive)]);
    assert.match(stdout, /package\/README.md/);
    if (archive.includes("tsthrift-0")) assert.match(stdout, /package\/THIRD_PARTY_NOTICES.md/);
  }
  await json(path.join(directory, "package.json"), { private: true, type: "module" });
  await run("npm", [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    ...archives.map((file) => path.join(directory, file)),
    "@angular/core@22.2.0",
    "rxjs@7.8.2",
  ]);
  await run(process.execPath, [
    "--input-type=module",
    "-e",
    `
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    for (const name of ['@vality/tsthrift', '@vality/tsthrift/runtime', '@vality/tsthrift-cli', '@vality/tsthrift-angular']) {
      assert.ok(Object.keys(await import(name)).length);
      assert.ok(Object.keys(createRequire(import.meta.url)(name)).length);
    }
  `,
  ]);
  const cli = path.join(directory, "node_modules/.bin/tsthrift-cli");
  await run(cli, ["--help"]);
  const protocol = path.join(directory, "protocol");
  await mkdir(protocol);
  await writeFile(
    path.join(protocol, "example.thrift"),
    'namespace js other\nconst binary BYTES = "abc"\nstruct Payload { 1: optional i64 id }\nservice Example { i64 echo(1: i64 value) }\n',
  );
  const runtimeVersion = JSON.parse(
    await readFile(path.join(root, "packages/tsthrift/package.json"), "utf8"),
  ).version;
  const manifest = {
    name: "tsthrift-smoke-proto",
    version: "1.0.0",
    type: "module",
    files: ["dist"],
    exports: {
      ".": { types: "./dist/index.d.mts", import: "./dist/index.mjs" },
      "./*": { types: "./dist/*/index.d.mts", import: "./dist/*/index.mjs" },
    },
    dependencies: { "@vality/tsthrift": runtimeVersion },
  };
  await json(path.join(protocol, "package.json"), manifest);
  // A consumer config must neither execute nor alter this build's entries or exports.
  await writeFile(
    path.join(protocol, "vite.config.ts"),
    'throw new Error("Consumer config must not load");',
  );
  for (let attempt = 0; attempt < 2; attempt++) {
    await run(cli, ["--input", "example.thrift", "--i64", "number", "--bundle"], protocol);
    assert.deepEqual(
      JSON.parse(await readFile(path.join(protocol, "package.json"), "utf8")),
      manifest,
    );
  }
  await run("npm", ["pack", "--pack-destination", directory], protocol);
  await run("npm", [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    path.join(directory, "tsthrift-smoke-proto-1.0.0.tgz"),
  ]);
  const installedDist = path.join(directory, "node_modules/tsthrift-smoke-proto/dist");
  const installedFiles = await readdir(installedDist, { recursive: true });
  for (const module of ["example/models", "example/metadata", "example/services/Example"]) {
    assert.ok(installedFiles.includes(`${module}.mjs`));
    assert.ok(installedFiles.includes(`${module}.d.mts`));
  }
  assert.match(
    await readFile(path.join(installedDist, "example/models.d.mts"), "utf8"),
    /export interface Payload/,
  );
  await writeFile(
    path.join(directory, "consumer.mts"),
    `
    import { BYTES, THRIFT_NAMESPACES, THRIFT_SERVICES } from "tsthrift-smoke-proto";
    const namespaces: readonly ["example"] = THRIFT_NAMESPACES;
    // @ts-expect-error Namespace names are readonly.
    THRIFT_NAMESPACES.push("example");
    // @ts-expect-error The namespace union excludes unknown module names.
    const unknownNamespace: typeof THRIFT_NAMESPACES[number] = "missing";
    import * as example from "tsthrift-smoke-proto/example";
    import { createExample } from "tsthrift-smoke-proto/example";
    const bytes: Uint8Array = BYTES;
    const payload: example.Payload = { id: 42 };
    const promise: Promise<number> = createExample({ endpoint: "unused" }).echo(42);
    // @ts-expect-error Generated method names cannot be overridden at runtime.
    createExample({ endpoint: "unused", lowerCaseMethods: true });
    // @ts-expect-error The factory mode is bound to its generated models.
    createExample({ endpoint: "unused", i64Mode: "bigint" });
    import type { ThriftMethodError, MetadataClientConfig } from "@vality/tsthrift";
    import { loadThriftMetadataByNamespaces } from "tsthrift-smoke-proto";
    import * as protocol from "tsthrift-smoke-proto";
    // @ts-expect-error The package root exports the explicit namespace selector.
    protocol.loadThriftMetadata;
    const selected = loadThriftMetadataByNamespaces(["example"] as const);
    const all = loadThriftMetadataByNamespaces(THRIFT_NAMESPACES);
    // @ts-expect-error Root selectors accept only known namespace names.
    loadThriftMetadataByNamespaces("missing");
    // @ts-expect-error Every selected namespace must be known.
    loadThriftMetadataByNamespaces(["example", "missing"]);
    const arbitraryNames: readonly string[] = ["example"];
    // @ts-expect-error Broad string arrays cannot guarantee known namespace names.
    loadThriftMetadataByNamespaces(arbitraryNames);
    const local = example.loadThriftMetadata();
    // @ts-expect-error Namespace-local loaders do not accept a namespace selection.
    example.loadThriftMetadata(["example"]);
    // @ts-expect-error A root loader requires an explicit namespace selection.
    loadThriftMetadataByNamespaces();
    const metadataConfig: MetadataClientConfig = { endpoint: "unused", namespace: "example", serviceName: "Example", metadata: () => loadThriftMetadataByNamespaces("example") };
    declare const failure: ThriftMethodError<typeof THRIFT_SERVICES["example.Example"], "echo">;
    // @ts-expect-error Registry errors must not be any.
    const invalid: boolean = failure;
    void [bytes, payload, promise, THRIFT_SERVICES, example, metadataConfig, invalid, namespaces, unknownNamespace, selected, all, local];
  `,
  );
  await run(path.join(directory, "node_modules/.bin/tsc"), [
    "--noEmit",
    "--strict",
    "--module",
    "nodenext",
    "--target",
    "es2022",
    "consumer.mts",
  ]);
  await run(process.execPath, [
    "--input-type=module",
    "-e",
    `
    import assert from 'node:assert/strict';
    import { BYTES, THRIFT_NAMESPACES, THRIFT_SERVICES, loadThriftMetadataByNamespaces } from 'tsthrift-smoke-proto';
    import * as example from 'tsthrift-smoke-proto/example';
    import { createExample } from 'tsthrift-smoke-proto/example';
    import { BinaryReader, BinaryWriter, MessageType } from '@vality/tsthrift';
    assert.ok(BYTES instanceof Uint8Array);
    assert.ok(!('loadThriftMetadata' in await import('tsthrift-smoke-proto')));
    assert.deepEqual(THRIFT_NAMESPACES, ['example']);
    assert.deepEqual((await example.loadThriftMetadata()).map(m => m.name), ['example']);
    assert.deepEqual((await loadThriftMetadataByNamespaces(['example', 'example'])).map(m => m.name), ['example']);
    assert.deepEqual((await loadThriftMetadataByNamespaces(THRIFT_NAMESPACES)).map(m => m.name), ['example']);
    await assert.rejects(loadThriftMetadataByNamespaces(), /Expected a namespace string or an array/);
    for (const namespace of THRIFT_NAMESPACES) {
      assert.ok((await loadThriftMetadataByNamespaces(namespace)).some(m => m.name === namespace));
    }
    const transport = async bytes => {
      const r = new BinaryReader(bytes); const h = r.readMessageBegin();
      r.readFieldBegin(); assert.equal(r.readI64(), 42n);
      const w = new BinaryWriter(); w.writeMessageBegin(h.name, MessageType.Reply, h.sequenceId);
      w.writeFieldBegin(10, 0); w.writeI64(42n); w.writeFieldStop(); return w.finish();
    };
    for (const factory of [example.createExample, createExample, THRIFT_SERVICES['example.Example'].createService]) {
      assert.equal(await factory({ endpoint: 'unused', transport, i64Mode: 'bigint', metadata: undefined }).echo(42), 42);
    }
  `,
  ]);
  await writeFile(
    path.join(directory, "angular-consumer.mts"),
    `
        import { BinaryReader } from "@vality/tsthrift/runtime";
        import { createObservableService, createPromiseService, provideThriftServices } from "@vality/tsthrift-angular";
        import { Example } from "tsthrift-smoke-proto/example";
        const token = createObservableService(Example, { endpoint: "/rpc" });
        const promiseToken = createPromiseService(Example, { endpoint: "/rpc" });
        provideThriftServices(token, promiseToken);
        new BinaryReader(new Uint8Array());
      `,
  );
  for (const resolution of ["node16", "bundler"]) {
    await json(path.join(directory, "tsconfig.consumer.json"), {
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: "ES2022",
        types: [],
        lib: ["ES2022", "DOM"],
        module: resolution === "node16" ? "Node16" : "ESNext",
        moduleResolution: resolution,
      },
      files: ["consumer.mts", "angular-consumer.mts"],
    });
    await run(process.execPath, [
      path.join(directory, "node_modules/typescript/lib/tsc.js"),
      "-p",
      "tsconfig.consumer.json",
    ]);
  }
  await run(process.execPath, [
    "--input-type=module",
    "-e",
    `
      import assert from 'node:assert/strict';
      import { createEnvironmentInjector } from '@angular/core';
      import { firstValueFrom } from 'rxjs';
      import { createObservableService, createPromiseService, provideThriftConfig, provideThriftServices } from '@vality/tsthrift-angular';
      const { THRIFT_METHOD_ARGUMENT_COUNT } = await import('@vality/tsthrift');
      const descriptor = { namespace: 'test', serviceName: 'Example', getMetadata: async () => [], createService: config => ({ echo: Object.assign(async value => config.endpoint + ':' + value, { [THRIFT_METHOD_ARGUMENT_COUNT]: 1 }) }) };
      const token = createObservableService(descriptor, { endpoint: 'service' });
      const promiseToken = createPromiseService(descriptor, { endpoint: 'promise' });
      const injector = createEnvironmentInjector([provideThriftConfig({ endpoint: 'global' }), provideThriftServices([token, promiseToken])], null);
      try {
        assert.equal(await firstValueFrom(injector.get(token).echo('value')), 'service:value');
        assert.equal(await injector.get(promiseToken).echo('value'), 'promise:value');
      }
      finally { injector.destroy(); }
    `,
  ]);
  console.log(
    "Package smoke passed: installed archives, ESM/require, CLI, bundled protocol, declarations, factories, regeneration, Angular 22 DI.",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
