// Compares the metadata-driven client (`@vality/tsthrift`) with the Apache `thrift` Binary Protocol
// on identical values. Run with `vp run bench`; it is not part of `ready` or CI.
//
// Every case is one full call: encode the request, then decode the reply. The Apache side is
// hand-written protocol code, because no Thrift compiler is used in this repository; this is the
// work generated Apache code performs, without its class wrappers. The tsthrift side goes through
// the public async client with a byte transport, so it also pays for Promises and call options.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { compileSources } from "../packages/compiler/dist/index.mjs";
import { createMetadataClient } from "../packages/tsthrift/dist/index.mjs";

const root = path.resolve(import.meta.dirname, "..");
const thrift = createRequire(path.join(root, "packages/tsthrift/package.json"))("thrift");
const { TBinaryProtocol, TBufferedTransport } = thrift;
const { Type, MessageType } = thrift.Thrift;

const ROUND_MS = Number(process.env.BENCH_ROUND_MS ?? 300);
const ROUNDS = Number(process.env.BENCH_ROUNDS ?? 7);
const FILTER = process.env.BENCH_CASE;
const ONLY = process.env.BENCH_ONLY; // "tsthrift" or "apache": for profiling one side
const SIZES = (process.env.BENCH_SIZES ?? "10,1000").split(",").map(Number);

const idl = `
struct Item {
  1: i64 id
  2: string name
  3: optional double score
  4: list<i32> tags
  5: map<string, string> attrs
  6: binary payload
  7: bool flag
}
struct Batch { 1: list<Item> items }
service Bench {
  i64 Ping(1: i64 x)
  void Put(1: Batch batch)
  Batch Get(1: i32 n)
}`;

// --- data -----------------------------------------------------------------------------------------

function item(i) {
  return {
    id: 1_000_000_000 + i,
    name: `item-${i}-lorem-ipsum-dolor-sit-amet`,
    tags: Array.from({ length: 8 }, (_, k) => i * 8 + k),
    attrs: new Map(Array.from({ length: 4 }, (_, k) => [`key${k}`, `value-${i}-${k}`])),
    payload: Uint8Array.from({ length: 64 }, (_, k) => (i + k) & 255),
    flag: i % 2 === 0,
    // Absent, not undefined: the decoder omits unset optional fields.
    ...(i % 3 === 0 ? {} : { score: i / 7 }),
  };
}
const batch = (n) => ({ items: Array.from({ length: n }, (_, i) => item(i)) });

// --- Apache: hand-written Binary Protocol --------------------------------------------------------

function writeItem(p, it) {
  p.writeStructBegin("Item");
  p.writeFieldBegin("id", Type.I64, 1);
  p.writeI64(it.id);
  p.writeFieldEnd();
  p.writeFieldBegin("name", Type.STRING, 2);
  p.writeString(it.name);
  p.writeFieldEnd();
  if (it.score !== undefined) {
    p.writeFieldBegin("score", Type.DOUBLE, 3);
    p.writeDouble(it.score);
    p.writeFieldEnd();
  }
  p.writeFieldBegin("tags", Type.LIST, 4);
  p.writeListBegin(Type.I32, it.tags.length);
  for (const tag of it.tags) p.writeI32(tag);
  p.writeListEnd();
  p.writeFieldEnd();
  p.writeFieldBegin("attrs", Type.MAP, 5);
  p.writeMapBegin(Type.STRING, Type.STRING, it.attrs.size);
  for (const [key, value] of it.attrs) {
    p.writeString(key);
    p.writeString(value);
  }
  p.writeMapEnd();
  p.writeFieldEnd();
  p.writeFieldBegin("payload", Type.STRING, 6);
  p.writeBinary(Buffer.from(it.payload.buffer, it.payload.byteOffset, it.payload.length));
  p.writeFieldEnd();
  p.writeFieldBegin("flag", Type.BOOL, 7);
  p.writeBool(it.flag);
  p.writeFieldEnd();
  p.writeFieldStop();
  p.writeStructEnd();
}

function writeBatch(p, value) {
  p.writeStructBegin("Batch");
  p.writeFieldBegin("items", Type.LIST, 1);
  p.writeListBegin(Type.STRUCT, value.items.length);
  for (const it of value.items) writeItem(p, it);
  p.writeListEnd();
  p.writeFieldEnd();
  p.writeFieldStop();
  p.writeStructEnd();
}

function readItem(p) {
  const it = {};
  p.readStructBegin();
  for (;;) {
    const field = p.readFieldBegin();
    if (field.ftype === Type.STOP) break;
    switch (field.fid) {
      case 1:
        it.id = p.readI64();
        break;
      case 2:
        it.name = p.readString();
        break;
      case 3:
        it.score = p.readDouble();
        break;
      case 4: {
        const list = p.readListBegin();
        it.tags = [];
        for (let i = 0; i < list.size; i++) it.tags.push(p.readI32());
        p.readListEnd();
        break;
      }
      case 5: {
        const map = p.readMapBegin();
        it.attrs = new Map();
        for (let i = 0; i < map.size; i++) it.attrs.set(p.readString(), p.readString());
        p.readMapEnd();
        break;
      }
      case 6:
        it.payload = p.readBinary();
        break;
      case 7:
        it.flag = p.readBool();
        break;
      default:
        p.skip(field.ftype);
    }
    p.readFieldEnd();
  }
  p.readStructEnd();
  return it;
}

function readBatch(p) {
  const value = { items: [] };
  p.readStructBegin();
  for (;;) {
    const field = p.readFieldBegin();
    if (field.ftype === Type.STOP) break;
    if (field.fid === 1) {
      const list = p.readListBegin();
      for (let i = 0; i < list.size; i++) value.items.push(readItem(p));
      p.readListEnd();
    } else p.skip(field.ftype);
    p.readFieldEnd();
  }
  p.readStructEnd();
  return value;
}

/** Writes one message; `body` writes the arguments or result fields, then the stop byte follows. */
function writeMessage(name, type, seqid, body) {
  let out;
  const transport = new TBufferedTransport(undefined, (bytes) => (out = bytes));
  const p = new TBinaryProtocol(transport);
  p.writeMessageBegin(name, type, seqid);
  p.writeStructBegin(`${name}_${type === MessageType.CALL ? "args" : "result"}`);
  body(p);
  p.writeFieldStop();
  p.writeStructEnd();
  p.writeMessageEnd();
  transport.flush();
  return out;
}

function readMessage(bytes, body) {
  let result;
  TBufferedTransport.receiver((transport) => {
    const p = new TBinaryProtocol(transport);
    p.readMessageBegin();
    p.readStructBegin();
    for (;;) {
      const field = p.readFieldBegin();
      if (field.ftype === Type.STOP) break;
      result = body(p, field);
      p.readFieldEnd();
    }
    p.readStructEnd();
    p.readMessageEnd();
  })(bytes);
  return result;
}

const readSuccess = (reader) => (p, field) => (field.fid === 0 ? reader(p) : p.skip(field.ftype));

// --- cases ----------------------------------------------------------------------------------------

const { metadata, client: modes } = await compileSources(
  { "bench.thrift": idl },
  { i64: "number", binary: "uint8array" },
);

/** Builds a client whose transport answers every request with `reply`, patching its sequence id. */
async function clientReplying(reply) {
  const view = new DataView(reply.buffer, reply.byteOffset, reply.byteLength);
  const replyNameLength = view.getInt32(4);
  return createMetadataClient({
    metadata,
    namespace: "bench",
    serviceName: "Bench",
    endpoint: "unused",
    ...modes,
    transport: async (request) => {
      const requestView = new DataView(request.buffer, request.byteOffset, request.byteLength);
      view.setInt32(8 + replyNameLength, requestView.getInt32(8 + requestView.getInt32(4)));
      return reply;
    },
  });
}

/** The bytes our client sends for one call, captured through a transport that fails the call. */
async function capturedRequest(method, args) {
  let captured;
  const client = await createMetadataClient({
    metadata,
    namespace: "bench",
    serviceName: "Bench",
    endpoint: "unused",
    ...modes,
    transport: async (request) => {
      captured = request.slice();
      throw new Error("captured");
    },
  });
  await client[method](...args).catch(() => {});
  return captured;
}

const seqidOf = (request) =>
  new DataView(request.buffer, request.byteOffset).getInt32(
    8 + new DataView(request.buffer, request.byteOffset).getInt32(4),
  );

const cases = [];

{
  const reply = writeMessage("Ping", MessageType.REPLY, 0, (p) => {
    p.writeFieldBegin("success", Type.I64, 0);
    p.writeI64(7);
    p.writeFieldEnd();
  });
  const request = (p) => {
    p.writeFieldBegin("x", Type.I64, 1);
    p.writeI64(42);
    p.writeFieldEnd();
  };
  cases.push({
    name: "Ping (tiny)",
    method: "Ping",
    args: [42],
    reply,
    request,
    apache: (seqid) => {
      writeMessage("Ping", MessageType.CALL, seqid, request);
      return readMessage(
        reply,
        readSuccess((p) => p.readI64()),
      );
    },
  });
}

for (const n of SIZES) {
  const data = batch(n);
  const putReply = writeMessage("Put", MessageType.REPLY, 0, () => {});
  const putBody = (p) => {
    p.writeFieldBegin("batch", Type.STRUCT, 1);
    writeBatch(p, data);
    p.writeFieldEnd();
  };
  cases.push({
    name: `Put ${n} items (encode-heavy)`,
    method: "Put",
    args: [data],
    reply: putReply,
    request: putBody,
    apache: (seqid) => {
      writeMessage("Put", MessageType.CALL, seqid, putBody);
      return readMessage(putReply, () => undefined);
    },
  });
  const getReply = writeMessage("Get", MessageType.REPLY, 0, (p) => {
    p.writeFieldBegin("success", Type.STRUCT, 0);
    writeBatch(p, data);
    p.writeFieldEnd();
  });
  const getRequest = (p) => {
    p.writeFieldBegin("n", Type.I32, 1);
    p.writeI32(n);
    p.writeFieldEnd();
  };
  cases.push({
    name: `Get ${n} items (decode-heavy)`,
    method: "Get",
    args: [n],
    reply: getReply,
    request: getRequest,
    expected: data,
    apache: (seqid) => {
      writeMessage("Get", MessageType.CALL, seqid, getRequest);
      return readMessage(getReply, readSuccess(readBatch));
    },
  });
}

// --- equivalence: identical request bytes, identical decoded values -------------------------------

for (const c of cases) {
  const request = await capturedRequest(c.method, c.args);
  const seqid = seqidOf(request);
  const apacheRequest = writeMessage(c.method, MessageType.CALL, seqid, c.request);
  assert.ok(Buffer.from(request).equals(apacheRequest), `${c.name}: requests differ`);
  const client = await clientReplying(c.reply);
  const result = await client[c.method](...c.args);
  if (c.expected)
    assert.deepEqual(result, c.expected, `${c.name}: tsthrift decoded a different value`);
  const decoded = c.apache(seqid);
  if (c.expected) {
    assert.equal(decoded.items.length, c.expected.items.length, `${c.name}: Apache item count`);
    assert.equal(decoded.items[0].name, c.expected.items[0].name, `${c.name}: Apache value`);
  }
  c.ours = async () => client[c.method](...c.args);
}

// --- timing ---------------------------------------------------------------------------------------

let sink;

async function rate(run, ms) {
  const end = performance.now() + ms;
  let count = 0;
  const start = performance.now();
  while (performance.now() < end) {
    for (let i = 0; i < 16; i++) sink = await run();
    count += 16;
  }
  return count / ((performance.now() - start) / 1000);
}

/**
 * The client captures a call site (`new Error()`) per call so errors report the caller. V8 skips
 * the stack walk when the limit is 0, which approximates a client without that feature; Apache
 * captures nothing. The limit is restored after each measurement.
 */
async function rateWithoutCallSite(run, ms) {
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 0;
  try {
    return await rate(run, ms);
  } finally {
    Error.stackTraceLimit = limit;
  }
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const format = (value) =>
  value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(value < 10 ? 2 : 0);

console.log(
  `tsthrift ${modes.i64Mode}/${modes.binaryMode} vs Apache thrift ${thrift.Thrift ? "0.25" : ""} Binary Protocol, ` +
    `${ROUNDS} rounds x ${ROUND_MS} ms, median calls/s (higher is better)\n`,
);
const rows = [];
for (const c of cases.filter((item) => !FILTER || item.name.includes(FILTER))) {
  const apacheRun = () => c.apache(1);
  await rate(c.ours, 150);
  await rateWithoutCallSite(c.ours, 150);
  await rate(apacheRun, 150);
  const ours = [];
  const lean = [];
  const apache = [];
  for (let round = 0; round < ROUNDS; round++) {
    ours.push(ONLY === "apache" ? 1 : await rate(c.ours, ROUND_MS));
    lean.push(ONLY === "apache" ? 1 : await rateWithoutCallSite(c.ours, ROUND_MS));
    apache.push(ONLY === "tsthrift" ? 1 : await rate(apacheRun, ROUND_MS));
  }
  const [o, l, a] = [median(ours), median(lean), median(apache)];
  rows.push({
    case: c.name,
    "tsthrift calls/s": format(o),
    "tsthrift, no call site": format(l),
    "Apache calls/s": format(a),
    "tsthrift / Apache": `${(o / a).toFixed(2)}x`,
    "no call site / Apache": `${(l / a).toFixed(2)}x`,
  });
}
console.table(rows);
globalThis.__benchSink = sink;
