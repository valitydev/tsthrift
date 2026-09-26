// Test-only adapter for the pinned Apache runtime; no generated tsthrift code is used.
const { TBinaryProtocol, TBufferedTransport, fromBigInt, toBigInt } = require("thrift");
const request = JSON.parse(process.argv[2]);

function execute(protocol) {
  return request.operations.map(([method, ...args]) => {
    if (method === "writeI64") args[0] = fromBigInt(BigInt(args[0]));
    if (method === "writeBinary") args[0] = Buffer.from(args[0]);
    const result = protocol[method](...args);
    if (method === "readI64") return String(toBigInt(result));
    if (Buffer.isBuffer(result)) return [...result];
    return result;
  });
}

if (request.mode === "encode") {
  const transport = new TBufferedTransport(undefined, (bytes) => {
    process.stdout.write(bytes.toString("base64"));
  });
  const protocol = new TBinaryProtocol(transport, false, request.strictWrite ?? true);
  execute(protocol);
  transport.flush();
} else {
  TBufferedTransport.receiver((transport) => {
    const protocol = new TBinaryProtocol(transport);
    process.stdout.write(JSON.stringify(execute(protocol)));
  })(Buffer.from(request.bytes, "base64"));
}
