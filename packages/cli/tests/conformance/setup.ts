import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from "node:fs/promises";
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
const mvn = process.env.MVN ?? "mvn";

export type ConformanceVariant = "vality-0.20.1" | "apache-0.24.0";

export async function run(command: string, args: string[]) {
  try {
    return await execute(command, args, { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    throw new Error(`${failure.message}\n${failure.stdout ?? ""}\n${failure.stderr ?? ""}`);
  }
}

export function getExpectedLibthriftVersion(variant: ConformanceVariant): string {
  return variant === "apache-0.24.0" ? "0.24.0" : "0.20.0";
}

function validateExplicitClasspath(paths: string[], variant: ConformanceVariant): string[] {
  for (const entry of paths) {
    if (!existsSync(entry)) {
      throw new Error(`Explicit THRIFT_CLASSPATH entry does not exist: ${entry}`);
    }
  }

  const expectedVersion = getExpectedLibthriftVersion(variant);
  const libthriftPattern = `libthrift-${expectedVersion}`;
  const hasLibthrift = paths.some((p) => path.basename(p).includes(libthriftPattern));
  const hasSlf4j = paths.some((p) => path.basename(p).includes("slf4j-api"));
  const hasAnnotation = paths.some((p) => path.basename(p).includes("annotation"));

  if (!hasLibthrift) {
    throw new Error(
      `Explicit THRIFT_CLASSPATH missing required ${libthriftPattern} jar for ${variant} variant. Given: ${paths.join(path.delimiter)}`,
    );
  }
  if (!hasSlf4j) {
    throw new Error(
      `Explicit THRIFT_CLASSPATH missing required slf4j-api jar. Given: ${paths.join(path.delimiter)}`,
    );
  }
  if (variant === "vality-0.20.1" && !hasAnnotation) {
    throw new Error(
      `Explicit THRIFT_CLASSPATH missing required javax.annotation-api jar for vality-0.20.1 variant. Given: ${paths.join(path.delimiter)}`,
    );
  }

  return paths;
}

async function resolveClasspath(variant: ConformanceVariant, directory: string): Promise<string[]> {
  if (process.env.THRIFT_CLASSPATH) {
    const paths = process.env.THRIFT_CLASSPATH.split(path.delimiter).filter(Boolean);
    return validateExplicitClasspath(paths, variant);
  }

  const expectedVersion = getExpectedLibthriftVersion(variant);
  const libthriftVersion = process.env.LIBTHRIFT_VERSION?.trim() || expectedVersion;
  if (libthriftVersion !== expectedVersion) {
    throw new Error(
      `Configured LIBTHRIFT_VERSION "${libthriftVersion}" does not match expected version "${expectedVersion}" for variant "${variant}".`,
    );
  }

  const pomPath = path.resolve(import.meta.dirname, "reference/pom.xml");
  const classpathFile = path.join(directory, "mvn-classpath.txt");

  await run(mvn, [
    "-f",
    pomPath,
    "dependency:build-classpath",
    `-Dlibthrift.version=${libthriftVersion}`,
    `-Dmdep.outputFile=${classpathFile}`,
    "-q",
  ]);

  if (!existsSync(classpathFile)) {
    throw new Error(`Maven did not generate classpath file at ${classpathFile}`);
  }

  const rawClasspath = (await readFile(classpathFile, "utf-8")).trim();
  const entries = rawClasspath.split(path.delimiter).filter(Boolean);
  if (entries.length === 0) {
    throw new Error(`Resolved classpath from Maven is empty for variant ${variant}`);
  }

  return entries;
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

/** Prepares Damsel conformance environment against an exact, verified Thrift compiler variant. */
export async function prepareConformance(directory: string) {
  const version = (await run(compiler, ["-version"])).stdout.trim();
  let variant: ConformanceVariant;
  if (version === "Thrift version 0.24.0") {
    variant = "apache-0.24.0";
  } else if (version === "Thrift version 0.20.1") {
    variant = "vality-0.20.1";
  } else {
    throw new Error(
      `Unsupported Thrift compiler version "${version}". Only official Apache Thrift 0.24.0 and Vality Thrift 0.20.1 are supported.`,
    );
  }

  const javaVersionRes = await run(java, ["-version"]);
  const javaRuntime =
    (javaVersionRes.stdout || javaVersionRes.stderr).split("\n")[0]?.trim() ?? "unknown";
  const javacVersionRes = await run(javac, ["-version"]);
  const javacVersion =
    (javacVersionRes.stdout || javacVersionRes.stderr).split("\n")[0]?.trim() ?? "unknown";

  const checkout = path.join(directory, "damsel");
  const targetRevision = process.env.DAMSEL_REVISION?.trim();
  if (targetRevision) {
    await run("git", ["init", checkout]);
    await run("git", [
      "-C",
      checkout,
      "remote",
      "add",
      "origin",
      "https://github.com/valitydev/damsel.git",
    ]);
    await run("git", ["-C", checkout, "fetch", "--depth", "1", "origin", targetRevision]);
    await run("git", ["-C", checkout, "checkout", "FETCH_HEAD"]);
  } else {
    await run("git", [
      "clone",
      "--depth",
      "1",
      "https://github.com/valitydev/damsel.git",
      checkout,
    ]);
  }
  const revision = (await run("git", ["-C", checkout, "rev-parse", "HEAD"])).stdout.trim();

  console.log(
    `Conformance: Damsel ${revision}; variant=${variant} (${version}); Java=${javaRuntime}; artifacts=${directory}`,
  );

  const jars = await resolveClasspath(variant, directory);

  await writeFile(
    path.join(directory, "provenance.json"),
    JSON.stringify(
      {
        damsel: revision,
        variant,
        compiler: version,
        compilerPath: compiler,
        javaRuntime,
        javac: javacVersion,
        libthriftVersion:
          process.env.LIBTHRIFT_VERSION?.trim() || getExpectedLibthriftVersion(variant),
        classpath: jars,
        backend: "java",
      },
      null,
      2,
    ),
  );

  const proto = path.join(checkout, "proto");
  const input = path.join(directory, "input");
  const generatedJava = path.join(directory, "java");
  const classes = path.join(directory, "classes");
  await cp(fixtures, input, { recursive: true });
  await mkdir(generatedJava);
  await mkdir(classes);

  const genOption = variant === "apache-0.24.0" ? "java:generated_annotations=suppress" : "java";
  for (const filename of [
    path.join(input, "alpha.thrift"),
    path.join(input, "beta.thrift"),
    path.join(proto, "domain_config_v2.thrift"),
  ]) {
    await run(compiler, ["-I", proto, "-r", "--gen", genOption, "-out", generatedJava, filename]);
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
    variant,
    compilerVersion: version,
    javaRuntime,
    javacVersion,
    oracle: (...args: string[]) => run(java, ["-cp", classpath, "Conformance", ...args]),
  };
}

export async function createConformanceDirectory(): Promise<string> {
  if (process.env.CONFORMANCE_OUTPUT_DIR) {
    const dir = path.resolve(process.env.CONFORMANCE_OUTPUT_DIR);
    await mkdir(dir, { recursive: true });
    return dir;
  }
  return mkdtemp(path.join(tmpdir(), "tsthrift-conformance-"));
}
