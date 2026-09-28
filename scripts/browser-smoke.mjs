import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "vite";
import { chromium } from "playwright";
import { generate } from "../packages/cli/dist/index.mjs";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(path.join(root, "packages/tsthrift/package.json"));
const thrift = require("thrift");
const directory = await mkdtemp(path.join(tmpdir(), "tsthrift-browser-"));
let browser;
let server;
try {
  await symlink(
    path.join(root, "packages/cli/node_modules"),
    path.join(directory, "node_modules"),
    "dir",
  );
  const input = path.join(directory, "example.thrift");
  await writeFile(input, "service Example { binary echo(1: binary value, 2: i64 number) }");
  const output = path.join(directory, "generated");
  await generate({ input, output, i64: "number" });
  await build({
    configFile: false,
    logLevel: "error",
    resolve: { alias: { __generated__: path.join(output, "index.ts") } },
    build: {
      outDir: path.join(directory, "web"),
      minify: true,
      lib: {
        entry: path.join(root, "packages/angular/tests/browser-smoke.ts"),
        name: "Smoke",
        formats: ["iife"],
        fileName: () => "smoke.js",
      },
    },
  });
  const javascript = await readFile(path.join(directory, "web/smoke.js"));
  const serverErrors = [];
  server = createServer(async (req, res) => {
    if (req.url === "/") {
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end('<script src="/smoke.js"></script>');
      return;
    }
    if (req.url === "/smoke.js") {
      res.setHeader("content-type", "text/javascript; charset=utf-8");
      res.end(javascript);
      return;
    }
    if (req.url === "/favicon.ico") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.url === "/slow") return;
    if (req.url === "/503") {
      res.writeHead(503);
      res.end("unavailable");
      return;
    }
    try {
      assert.equal(req.headers.authorization, "new");
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      thrift.TBufferedTransport.receiver((transport) => {
        const protocol = new thrift.TBinaryProtocol(transport);
        const header = protocol.readMessageBegin();
        protocol.readFieldBegin();
        const value = protocol.readBinary();
        protocol.readFieldBegin();
        assert.equal(thrift.toBigInt(protocol.readI64()), 42n);
        assert.deepEqual([...value], [0, 128, 255]);
        const response = new thrift.TBufferedTransport(undefined, (bytes) => {
          res.setHeader("content-type", "application/x-thrift");
          res.end(bytes);
        });
        const reply = new thrift.TBinaryProtocol(response);
        reply.writeMessageBegin(header.fname, 2, header.rseqid);
        reply.writeFieldBegin("success", 11, 0);
        reply.writeBinary(value);
        reply.writeFieldStop();
        response.flush();
      })(Buffer.concat(chunks));
    } catch (error) {
      serverErrors.push(error);
      res.writeHead(500);
      res.end(String(error));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  assert.deepEqual(
    pageErrors.map((error) => error.message),
    [],
  );
  const result = await page.evaluate(() => globalThis.Smoke.runBrowserSmoke());
  assert.deepEqual(serverErrors, []);
  assert.deepEqual(pageErrors, []);
  console.log(result);
} finally {
  await browser?.close();
  server?.closeAllConnections();
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
