import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readdir, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { generate } from "../../src/index.ts";

const execute = promisify(execFile);
const fixtures = path.join(import.meta.dirname, "fixtures");
const compiler = process.env.THRIFT_COMPILER ?? "thrift";
const java = process.env.JAVA ?? "java";
const javac = process.env.JAVAC ?? "javac";

export async function run(command: string, args: string[]) {
  try {
    return await execute(command, args, { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    throw new Error(`${failure.message}\n${failure.stdout ?? ""}\n${failure.stderr ?? ""}`);
  }
}

async function downloadJar(directory: string, artifact: string, digest: string) {
  const response = await fetch(`https://repo.maven.apache.org/maven2/${artifact}`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Cannot download ${artifact}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== digest)
    throw new Error(`Artifact checksum mismatch: ${artifact}`);
  const filename = path.join(directory, path.basename(artifact));
  await writeFile(filename, bytes);
  return filename;
}

async function javaSources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const filename = path.join(directory, entry.name);
      return entry.isDirectory()
        ? javaSources(filename)
        : Promise.resolve(entry.name.endsWith(".java") ? [filename] : []);
    }),
  );
  return files.flat();
}

/** Downloads current Damsel HEAD; the official compiler receives the original IDL unchanged. */
export async function prepareConformance(directory: string) {
  const version = (await run(compiler, ["-version"])).stdout.trim();
  if (version !== "Thrift version 0.24.0")
    throw new Error(`Expected Apache 0.24.0, got ${version}`);
  await run(java, ["-version"]);
  await run(javac, ["-version"]);
  const checkout = path.join(directory, "damsel");
  await run("git", ["clone", "--depth", "1", "https://github.com/valitydev/damsel.git", checkout]);
  const revision = (await run("git", ["-C", checkout, "rev-parse", "HEAD"])).stdout.trim();
  console.log(`Conformance: Damsel ${revision}; ${version}; artifacts ${directory}`);
  await writeFile(
    path.join(directory, "provenance.json"),
    JSON.stringify({ damsel: revision, compiler: version, backend: "java" }, null, 2),
  );
  const proto = path.join(checkout, "proto");
  const input = path.join(directory, "input");
  const generatedJava = path.join(directory, "java");
  const classes = path.join(directory, "classes");
  await cp(fixtures, input, { recursive: true });
  await mkdir(generatedJava);
  await mkdir(classes);
  const jars = await Promise.all([
    downloadJar(
      directory,
      "org/apache/thrift/libthrift/0.24.0/libthrift-0.24.0.jar",
      "b72e321ff144e3e5211964764bd45794b96fdf250085f153c44416b35df89a07",
    ),
    downloadJar(
      directory,
      "org/slf4j/slf4j-api/2.0.17/slf4j-api-2.0.17.jar",
      "7b751d952061954d5abfed7181c1f645d336091b679891591d63329c622eb832",
    ),
  ]);
  for (const filename of [
    path.join(input, "alpha.thrift"),
    path.join(input, "beta.thrift"),
    path.join(proto, "domain_config_v2.thrift"),
  ]) {
    await run(compiler, [
      "-I",
      proto,
      "-r",
      "--gen",
      "java:generated_annotations=suppress",
      "-out",
      generatedJava,
      filename,
    ]);
  }
  const sources = [
    ...(await javaSources(generatedJava)),
    ...(await javaSources(path.join(import.meta.dirname, "reference"))),
  ];
  const sourceList = path.join(directory, "java-sources.txt");
  await writeFile(sourceList, sources.map((file) => JSON.stringify(file)).join("\n"));
  const classpath = [...jars, classes].join(path.delimiter);
  await run(javac, ["-cp", classpath, "-d", classes, `@${sourceList}`]);
  await symlink(
    path.resolve(import.meta.dirname, "../../node_modules"),
    path.join(directory, "node_modules"),
    "dir",
  );
  await writeFile(path.join(directory, "package.json"), '{"type":"module"}');
  const require = createRequire(import.meta.url);
  const tsc = path.resolve(path.dirname(require.resolve("typescript")), "../bin/tsc");
  for (const i64 of ["bigint", "number"] as const) {
    const output = path.join(directory, i64);
    await generate({ input, includes: [proto], output, i64, package: true });
    await generate({
      input: proto,
      output: path.join(output, "damsel"),
      namespaces: ["domain_config_v2"],
      i64,
      package: true,
    });
    await run(process.execPath, [tsc, "-p", path.join(output, "tsconfig.json")]);
  }
  return {
    directory,
    revision,
    oracle: (...args: string[]) => run(java, ["-cp", classpath, "Conformance", ...args]),
  };
}

export function createConformanceDirectory() {
  return mkdtemp(path.join(tmpdir(), "tsthrift-conformance-"));
}
