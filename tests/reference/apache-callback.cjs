// Execute generated Promise clients and processors through real binary buffers.
const assert = require("node:assert/strict");
const thrift = require("thrift");
const { Client, Processor } = require(process.argv[2]);
const { Failure } = require(process.argv[3]);
const { TBinaryProtocol, TBufferedTransport } = thrift;
const calls = [];
const processor = new Processor({
  async invoke(callback, callback1, _callback) {
    calls.push([callback, callback1, _callback].map(String));
    if (callback < 0n) throw new Failure({ reason: "negative input" });
    return callback + callback1 + _callback;
  },
});

let client;
const transport = new TBufferedTransport(undefined, (request) => {
  TBufferedTransport.receiver((input) => {
    const responseTransport = new TBufferedTransport(undefined, (response) => {
      TBufferedTransport.receiver((received) => {
        const protocol = new TBinaryProtocol(received);
        const header = protocol.readMessageBegin();
        client[`recv_${header.fname}`](protocol, header.mtype, header.rseqid);
      })(response);
    });
    processor.process(new TBinaryProtocol(input), new TBinaryProtocol(responseTransport));
  })(request);
});
client = new Client(transport, TBinaryProtocol);

async function run() {
  const result = client.invoke(9007199254740993n, 2n, 3n);
  assert.ok(result instanceof Promise);
  assert.equal(await result, 9007199254740998n);
  await assert.rejects(client.invoke(-1n, 0n, 0n), { reason: "negative input" });
  assert.deepEqual(Object.keys(client._reqs), []);
  process.stdout.write(JSON.stringify(calls));
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
