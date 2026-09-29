// Execute compiled output with Apache's independent Binary Protocol implementation.
import assert from "node:assert/strict";
import { loadClient } from "./load-client.mjs";
import thrift from "thrift";
import { BinaryReader, BinaryWriter, MessageType, ThriftApplicationError } from "@vality/tsthrift";
const [directory, mode, backend = "native"] = process.argv.slice(2);
const { createExampleClient, THRIFT_SERVICES, types, model } = await loadClient(
  directory,
  mode,
  backend,
);
const integer = (value) => (mode === "number" ? Number(value) : BigInt(value));
const { TBinaryProtocol, TBufferedTransport, fromBigInt, toBigInt } = thrift;
const big = mode === "number" ? 123n : 9007199254740993n;
const input = {
  values: new Map([
    [{ id: integer(big), name: "first" }, new Set([integer(big)])],
    [{ id: integer(2), name: "second" }, new Set()],
  ]),
  empty: {},
  bytes: new Uint8Array([0, 128, 255]),
  node: { next: {} },
};
let observed;
let variant = "success";
const options = { headers: { "x-woody-trace-id": "trace" } };
const lifecycle = [];
const client = await createExampleClient({
  endpoint: "http://unused",
  loggingFn: (event) => lifecycle.push(event.type),
  transport: async (bytes, requestOptions) => {
    assert.equal(requestOptions, options);
    let header;
    TBufferedTransport.receiver((transport) => {
      const p = new TBinaryProtocol(transport);
      header = p.readMessageBegin();
      assert.equal(header.fname, "exchange");
      assert.equal(header.mtype, 1);
      assert.equal(p.readFieldBegin().fid, 1);
      assert.equal(p.readFieldBegin().fid, 1);
      const map = p.readMapBegin();
      assert.deepEqual([map.ktype, map.vtype, map.size], [12, 14, 2]);
      const entries = [];
      for (let i = 0; i < map.size; i++) {
        assert.equal(p.readFieldBegin().fid, 1);
        const id = toBigInt(p.readI64());
        assert.equal(p.readFieldBegin().fid, 2);
        const name = p.readString();
        assert.equal(p.readFieldBegin().ftype, 0);
        const set = p.readSetBegin();
        const values = Array.from({ length: set.size }, () => toBigInt(p.readI64()));
        entries.push([id, name, values]);
      }
      observed = entries;
      assert.equal(p.readFieldBegin().fid, 2);
      assert.equal(p.readFieldBegin().ftype, 0); // Present empty struct.
      assert.equal(p.readFieldBegin().fid, 3);
      assert.deepEqual([...p.readBinary()], [0, 128, 255]);
      assert.equal(p.readFieldBegin().fid, 4);
      p.skip(12);
      assert.equal(p.readFieldBegin().ftype, 0);
      assert.equal(p.readFieldBegin().fid, 2);
      assert.equal(p.readString(), "callback data");
      assert.equal(p.readFieldBegin().fid, 3);
      assert.equal(p.readI32(), 7);
      assert.equal(p.readFieldBegin().ftype, 0);
    })(Buffer.from(bytes));
    let response;
    const transport = new TBufferedTransport(undefined, (value) => {
      response = value;
    });
    const p = new TBinaryProtocol(transport);
    p.writeMessageBegin(
      variant === "method" ? "wrong" : header.fname,
      variant === "application" ? 3 : variant === "type" ? 1 : 2,
      header.rseqid + (variant === "sequence" ? 1 : 0),
    );
    if (variant === "application") {
      p.writeFieldBegin("message", 11, 1);
      p.writeString("server failed");
      p.writeFieldBegin("type", 8, 2);
      p.writeI32(6);
    } else if (variant === "declared") {
      p.writeFieldBegin("failure", 12, 1);
      p.writeFieldBegin("reason", 11, 1);
      p.writeString("declared failure");
      p.writeFieldStop();
    } else if (variant !== "missing") {
      p.writeFieldBegin("success", 12, 0);
      p.writeFieldBegin("values", 13, 1);
      p.writeMapBegin(12, 14, 2);
      for (const [id, name, values] of observed) {
        p.writeFieldBegin("id", 10, 1);
        p.writeI64(fromBigInt(id));
        p.writeFieldBegin("name", 11, 2);
        p.writeString(name);
        p.writeFieldStop();
        p.writeSetBegin(10, values.length);
        for (const value of values) p.writeI64(fromBigInt(value));
      }
      p.writeFieldBegin("empty", 12, 2);
      p.writeFieldStop();
      p.writeFieldBegin("bytes", 11, 3);
      p.writeBinary(Buffer.from([0, 128, 255]));
      p.writeFieldBegin("unknown", 15, 99);
      p.writeListBegin(11, 1);
      p.writeString("ignored");
      p.writeFieldStop();
    }
    p.writeFieldStop();
    transport.flush();
    return variant === "trailing" ? new Uint8Array([...response, 0]) : new Uint8Array(response);
  },
});
const result = await client.exchange(input, "callback data", 7, options);
assert.deepEqual(result, { values: input.values, empty: {}, bytes: input.bytes });
assert.deepEqual(observed, [
  [big, "first", [big]],
  [2n, "second", []],
]);
if (model) {
  assert.ok(model.BYTES instanceof Uint8Array);
  const bytes = model.BYTES;
  assert.deepEqual([...bytes], [97, 98, 99]);
}
assert.deepEqual(lifecycle, ["call", "success"]);
for (const failure of [
  "method",
  "sequence",
  "type",
  "missing",
  "trailing",
  "application",
  "declared",
]) {
  variant = failure;
  await assert.rejects(client.exchange(input, "callback data", 7, options), (error) => {
    if (failure === "declared") assert.deepEqual(error, { reason: "declared failure" });
    else if (failure === "application") {
      assert.ok(error instanceof ThriftApplicationError);
      assert.equal(error.code, 6);
    } else assert.ok(error instanceof Error);
    return true;
  });
}
if (THRIFT_SERVICES)
  assert.ok(Array.isArray(await THRIFT_SERVICES["example.Example"].getMetadata()));
const other = await createExampleClient({
  endpoint: "http://unused",
  transport: async (bytes) => {
    const r = new BinaryReader(bytes);
    const header = r.readMessageBegin();
    const w = new BinaryWriter();
    if (header.name === "fire") {
      assert.equal(header.type, MessageType.Oneway);
      return new Uint8Array();
    }
    w.writeMessageBegin(header.name, MessageType.Reply, header.sequenceId);
    if (header.name === "inherited") {
      w.writeFieldBegin(11, 0);
      w.writeString("inherited reply");
    }
    if (header.name === "numeric") {
      w.writeFieldBegin(10, 0);
      w.writeI64(9223372036854775807n);
    }
    w.writeFieldStop();
    return w.finish();
  },
});
assert.equal(await other.inherited("hello"), "inherited reply");
assert.equal(await other.notify("hello"), undefined);
assert.equal(await other.fire("hello"), undefined);
if (mode === "number") await assert.rejects(other.numeric(1), /safe number range/);
else assert.equal(await other.numeric(1n), 9223372036854775807n);
if (types) {
  const w = new BinaryWriter();
  types.Payload.write(w, input);
  const roundtrip = types.Payload.read(new BinaryReader(w.finish()));
  assert.deepEqual(roundtrip.node, {
    text: "default",
    state: 4,
    next: { text: "default", state: 4 },
  });
  assert.throws(() => types.Payload.write(new BinaryWriter(), {}), /required/);
  assert.throws(
    () => types.Choice.write(new BinaryWriter(), { text: "a", integer: integer(1) }),
    /Multiple fields/,
  );
}
console.log(`${backend} client checks passed`);
