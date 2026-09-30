// Exercise the generated native client over a real HTTP socket using Apache wire decoding.
import assert from "node:assert/strict";
import http from "node:http";
import { loadClient } from "./load-client.mjs";
import thrift from "thrift";
import { ThriftHttpError, ThriftProtocolError, ThriftTimeoutError } from "@vality/tsthrift";
const [directory, mode = "bigint", backend = "native"] = process.argv.slice(2);
const { createExampleClient } = await loadClient(directory, mode, backend);
const { TBinaryProtocol, TBufferedTransport } = thrift;
const server = http.createServer(async (req, res) => {
  if (req.url === "/timeout") return;
  if (req.url === "/500") {
    res.writeHead(500);
    res.end("failed");
    return;
  }
  if (req.url === "/html") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("html");
    return;
  }
  try {
    assert.equal(req.headers["x-woody-trace-id"], "per-call");
    assert.equal(req.headers.authorization, "token");
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    TBufferedTransport.receiver((transport) => {
      const p = new TBinaryProtocol(transport);
      const header = p.readMessageBegin();
      assert.equal(header.fname, "inherited");
      assert.equal(p.readFieldBegin().fid, 1);
      const message = p.readString();
      const output = new TBufferedTransport(undefined, (bytes) => {
        res.writeHead(200, { "Content-Type": "application/x-thrift" });
        res.end(bytes);
      });
      const reply = new TBinaryProtocol(output);
      reply.writeMessageBegin(header.fname, 2, header.rseqid);
      reply.writeFieldBegin("success", 11, 0);
      reply.writeString(`echo:${message}`);
      reply.writeFieldStop();
      output.flush();
    })(Buffer.concat(chunks));
  } catch (error) {
    res.writeHead(500);
    console.error(error);
    res.end("internal error");
  }
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const endpoint = `http://127.0.0.1:${server.address().port}`;
try {
  const client = await createExampleClient({
    endpoint,
    headers: async () => ({ authorization: "token" }),
  });
  const headers = { "x-woody-trace-id": "per-call" };
  assert.deepEqual(
    await Promise.all([client.inherited("a", { headers }), client.inherited("b", { headers })]),
    ["echo:a", "echo:b"],
  );
  await assert.rejects(
    (await createExampleClient({ endpoint: `${endpoint}/500` })).inherited("a"),
    ThriftHttpError,
  );
  await assert.rejects(
    (await createExampleClient({ endpoint: `${endpoint}/html` })).inherited("a"),
    ThriftProtocolError,
  );
  await assert.rejects(
    (await createExampleClient({ endpoint: `${endpoint}/timeout`, timeoutMs: 20 })).inherited("a"),
    ThriftTimeoutError,
  );
  await assert.rejects(
    client.inherited("a", { signal: AbortSignal.abort(new Error("cancelled")) }),
    /cancelled/,
  );
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
console.log(`${backend} HTTP checks passed`);
