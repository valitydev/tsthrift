import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
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
    "vite-plus@0.3.0",
    "typescript@7.0.2",
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
    'const binary BYTES = "abc"\nservice Example { i64 echo(1: i64 value) }\n',
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
  await writeFile(
    path.join(directory, "consumer.mts"),
    `
    import { example, SERVICES } from "tsthrift-smoke-proto";
    import { createExample } from "tsthrift-smoke-proto/example";
    const bytes: Uint8Array = example.BYTES;
    const promise: Promise<number> = createExample({ endpoint: "unused" }).echo(42);
    // @ts-expect-error The factory mode is bound to its generated models.
    createExample({ endpoint: "unused", i64Mode: "bigint" });
    void [bytes, promise, SERVICES];
  `,
  );
  await run(path.join(directory, "node_modules/.bin/tsc"), [
    "--noEmit",
    "--strict",
    "--skipLibCheck",
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
    import { example, SERVICES } from 'tsthrift-smoke-proto';
    import { createExample } from 'tsthrift-smoke-proto/example';
    import { BinaryReader, BinaryWriter, MessageType } from '@vality/tsthrift';
    assert.ok(example.BYTES instanceof Uint8Array);
    const transport = async bytes => {
      const r = new BinaryReader(bytes); const h = r.readMessageBegin();
      r.readFieldBegin(); assert.equal(r.readI64(), 42n);
      const w = new BinaryWriter(); w.writeMessageBegin(h.name, MessageType.Reply, h.sequenceId);
      w.writeFieldBegin(10, 0); w.writeI64(42n); w.writeFieldStop(); return w.finish();
    };
    for (const factory of [example.createExample, createExample, SERVICES['example.Example'].createService]) {
      assert.equal(await factory({ endpoint: 'unused', transport, i64Mode: 'bigint', metadata: undefined }).echo(42), 42);
    }
  `,
  ]);
  for (const version of ["22.2.0", "16.2.12"]) {
    if (version === "16.2.12")
      await run("npm", [
        "install",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        `@angular/core@${version}`,
      ]);
    await run(process.execPath, [
      "--input-type=module",
      "-e",
      `
      import assert from 'node:assert/strict';
      import { createEnvironmentInjector } from '@angular/core';
      import { firstValueFrom } from 'rxjs';
      import { createObservableService, provideThriftConfig, provideThriftServices } from '@vality/tsthrift-angular';
      const descriptor = { namespace: 'test', serviceName: 'Example', getMetadata: async () => [], createService: config => ({ echo: async value => config.endpoint + ':' + value }) };
      const token = createObservableService(descriptor, { endpoint: 'service' });
      const injector = createEnvironmentInjector([provideThriftConfig({ endpoint: 'global' }), provideThriftServices([token])], null);
      try { assert.equal(await firstValueFrom(injector.get(token).echo('value')), 'service:value'); }
      finally { injector.destroy(); }
    `,
    ]);
  }
  console.log(
    "Package smoke passed: installed archives, ESM/require, CLI, bundled protocol, declarations, factories, regeneration, Angular 16/22 DI.",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
