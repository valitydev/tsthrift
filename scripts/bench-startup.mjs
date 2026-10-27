// Measures what it costs to get a working client from IDL, by three routes:
//   on the fly   compileSources -> createMetadataClient -> first call (what a UI does)
//   precompiled  JSON.parse(metadata.json) -> createMetadataClient -> first call
//   CLI build    generate() writing TypeScript, and with --bundle (the build-time route)
// Run with `vp run bench:startup`; it is not part of `ready` or CI.
//
// "cold" is the median of fresh Node.js processes, each running the route once, so JIT warm-up is
// included, as for the first compile on a page. "warm" is the median of repeated runs in one
// process. IDL is synthetic: modules include their predecessor, and every struct references the
// previous one, an enum, a typedef, containers, and an exception.
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { compileSources } from "../packages/compiler/dist/index.mjs";
import { generate } from "../packages/cli/dist/index.mjs";
import { createMetadataClient } from "../packages/tsthrift/dist/index.mjs";
import { BinaryReader, BinaryWriter, MessageType } from "../packages/tsthrift/dist/runtime.mjs";

const root = path.resolve(import.meta.dirname, "..");
const COLD_RUNS = Number(process.env.BENCH_COLD_RUNS ?? 7);
const BUILD_RUNS = Number(process.env.BENCH_BUILD_RUNS ?? 3);
const SHAPES = {
  small: { modules: 1, structs: 5, services: 1, methods: 4 },
  medium: { modules: 5, structs: 20, services: 2, methods: 10 },
  large: { modules: 20, structs: 50, services: 3, methods: 20 },
};
const WARM_RUNS = { small: 200, medium: 40, large: 8 };
const MODES = { i64: "number", binary: "uint8array" };

function moduleText(shape, m) {
  const lines = [];
  if (m > 0) lines.push(`include "m${m - 1}.thrift"`);
  lines.push(`enum Kind${m} { A = 0, B = 1, C = 2 }`, `typedef string Id${m}`);
  lines.push(`exception Failure${m} { 1: string message }`);
  for (let k = 0; k < shape.structs; k++) {
    const fields = [
      `1: required Id${m} id`,
      "2: string name",
      "3: optional i64 amount",
      `4: Kind${m} kind`,
      "5: list<i32> tags",
      "6: map<string, string> attrs",
      "7: binary data",
      "8: bool flag",
    ];
    if (k > 0) fields.push(`9: optional S${k - 1} prev`, `10: list<S${k - 1}> history`);
    if (m > 0) fields.push(`11: optional m${m - 1}.S0 upstream`);
    lines.push(`struct S${k} {\n  ${fields.join("\n  ")}\n}`);
  }
  for (let v = 0; v < shape.services; v++) {
    const methods = Array.from({ length: shape.methods }, (_, f) => {
      const result = f === 0 ? "void" : `S${f % shape.structs}`;
      return `${result} Method${f}(1: S${(f * 3) % shape.structs} first, 2: i32 limit) throws (1: Failure${m} failure)`;
    });
    lines.push(`service Api${m}x${v} {\n  ${methods.join("\n  ")}\n}`);
  }
  return lines.join("\n");
}

function sourcesFor(shape) {
  return Object.fromEntries(
    Array.from({ length: shape.modules }, (_, m) => [`m${m}.thrift`, moduleText(shape, m)]),
  );
}

/** The service and method every route calls once. */
function target(shape) {
  return { namespace: `m${shape.modules - 1}`, serviceName: `Api${shape.modules - 1}x0` };
}

// A transport that answers any call with an empty, successful `void` reply.
async function replyVoid(request) {
  const header = new BinaryReader(request).readMessageBegin();
  const writer = new BinaryWriter();
  writer.writeMessageBegin(header.name, MessageType.Reply, header.sequenceId);
  writer.writeFieldStop();
  return writer.finish();
}

async function clientFrom(metadata, shape) {
  return createMetadataClient({
    metadata,
    ...target(shape),
    endpoint: "unused",
    i64Mode: MODES.i64,
    binaryMode: MODES.binary,
    transport: replyVoid,
  });
}

const time = async (fn) => {
  const start = performance.now();
  const value = await fn();
  return [performance.now() - start, value];
};

/** One pass of a route, returning per-stage milliseconds. */
async function run(route, shape, input) {
  const stages = {};
  if (route === "onthefly") {
    let result;
    [stages.compile, result] = await time(() => compileSources(input, MODES));
    let client;
    [stages.init, client] = await time(() => clientFrom(result.metadata, shape));
    [stages.firstCall] = await time(() => client.Method0({ id: "x" }, 10));
  } else if (route === "emit") {
    [stages.compile] = await time(() => compileSources(input, { ...MODES, emit: true }));
  } else {
    let metadata;
    [stages.parse, metadata] = await time(() => JSON.parse(input));
    let client;
    [stages.init, client] = await time(() => clientFrom(metadata, shape));
    [stages.firstCall] = await time(() => client.Method0({ id: "x" }, 10));
  }
  stages.total = Object.values(stages).reduce((sum, ms) => sum + ms, 0);
  return stages;
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const medians = (runs) =>
  Object.fromEntries(Object.keys(runs[0]).map((key) => [key, median(runs.map((r) => r[key]))]));

// --- child: one cold pass ------------------------------------------------------------------------

if (process.argv[2] === "--child") {
  const [, , , route, size, file] = process.argv;
  const shape = SHAPES[size];
  const input =
    route === "precompiled"
      ? await readFile(file, "utf8")
      : JSON.parse(await readFile(file, "utf8"));
  process.stdout.write(JSON.stringify(await run(route, shape, input)));
  process.exit(0);
}

// --- parent ---------------------------------------------------------------------------------------

const ms = (value) => (value >= 100 ? value.toFixed(0) : value.toFixed(1));
const work = await mkdtemp(path.join(tmpdir(), "tsthrift-bench-"));
const rows = [];
try {
  for (const [size, shape] of Object.entries(SHAPES)) {
    const sources = sourcesFor(shape);
    const { metadata } = await compileSources(sources, MODES);
    const metadataText = JSON.stringify(metadata);
    const sourcesFile = path.join(work, `${size}.sources.json`);
    const metadataFile = path.join(work, `${size}.metadata.json`);
    await writeFile(sourcesFile, JSON.stringify(sources));
    await writeFile(metadataFile, metadataText);

    const idlBytes = Object.values(sources).reduce((sum, text) => sum + text.length, 0);
    const services = shape.modules * shape.services * shape.methods;
    console.log(
      `\n${size}: ${shape.modules} modules, ${shape.modules * shape.structs} structs, ` +
        `${services} methods, IDL ${(idlBytes / 1024).toFixed(0)} KiB, ` +
        `metadata ${(metadataText.length / 1024).toFixed(0)} KiB`,
    );

    const cold = {};
    for (const [route, file] of [
      ["onthefly", sourcesFile],
      ["emit", sourcesFile],
      ["precompiled", metadataFile],
    ]) {
      const passes = [];
      for (let i = 0; i < COLD_RUNS; i++) {
        const child = spawnSync(
          process.execPath,
          [import.meta.filename, "--child", route, size, file],
          {
            encoding: "utf8",
          },
        );
        if (child.status !== 0) throw new Error(`${route}/${size} failed: ${child.stderr}`);
        passes.push(JSON.parse(child.stdout));
      }
      cold[route] = medians(passes);
    }

    const warm = {};
    for (const [route, input] of [
      ["onthefly", sources],
      ["emit", sources],
      ["precompiled", metadataText],
    ]) {
      const passes = [];
      for (let i = 0; i < WARM_RUNS[size] + 3; i++) passes.push(await run(route, shape, input));
      warm[route] = medians(passes.slice(3));
    }

    // Build-time route: write the TypeScript package, then bundle it.
    const input = path.join(work, `${size}-idl`);
    await mkdir(input, { recursive: true });
    for (const [name, text] of Object.entries(sources))
      await writeFile(path.join(input, name), text);
    await symlink(
      path.join(root, "packages/cli/node_modules"),
      path.join(work, "node_modules"),
      "dir",
    ).catch(() => {});
    const build = {};
    for (const [label, options] of [
      ["generate (TypeScript sources)", {}],
      ["generate --bundle (ESM + .d.mts)", { bundle: true }],
    ]) {
      const runs = [];
      for (let i = 0; i < BUILD_RUNS; i++) {
        const out = path.join(work, `${size}-out-${runs.length}`);
        const [elapsed] = await time(() =>
          generate({
            input,
            output: out,
            dist: `${out}-dist`,
            i64: MODES.i64,
            binary: MODES.binary,
            ...options,
          }),
        );
        runs.push(elapsed);
        await rm(out, { recursive: true, force: true });
        await rm(`${out}-dist`, { recursive: true, force: true });
      }
      build[label] = median(runs);
    }

    rows.push(
      ...[
        ["on the fly: compile IDL", "onthefly", "compile"],
        ["on the fly: create client", "onthefly", "init"],
        ["on the fly: first call", "onthefly", "firstCall"],
        ["on the fly: total", "onthefly", "total"],
        ["on the fly: compile + emit TypeScript", "emit", "compile"],
        ["precompiled metadata: parse JSON", "precompiled", "parse"],
        ["precompiled metadata: total", "precompiled", "total"],
      ].map(([label, route, stage]) => ({
        size,
        step: label,
        "cold ms": ms(cold[route][stage]),
        "warm ms": ms(warm[route][stage]),
      })),
      ...Object.entries(build).map(([label, value]) => ({
        size,
        step: `CLI build: ${label}`,
        "cold ms": "-",
        "warm ms": ms(value),
      })),
    );
  }
  console.log(
    `\ncold = median of ${COLD_RUNS} fresh processes; warm = median of repeated runs in one process ` +
      `(CLI build: median of ${BUILD_RUNS} runs in this process)\n`,
  );
  console.table(rows);
} finally {
  await rm(work, { recursive: true, force: true });
}
