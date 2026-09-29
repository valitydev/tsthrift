import { firstValueFrom } from "rxjs";
import { expect, test } from "vite-plus/test";
import {
  BinaryReader,
  BinaryWriter,
  MessageType,
  type Metadata,
  THRIFT_RESULT,
  createLazyMetadataClient,
  createMetadataClient,
} from "@vality/tsthrift";
import { catchThriftResult, toObservableClient } from "../src/rxjs.ts";

const metadata: Metadata[] = [
  {
    name: "example",
    path: "example.thrift",
    ast: {
      struct: {
        Payload: [
          { id: 1, name: "headers", type: "string" },
          { id: 2, name: "data", type: "string" },
        ],
      },
      service: {
        Example: {
          functions: {
            echo: {
              name: "echo",
              type: "Payload",
              oneway: false,
              args: [{ id: 1, name: "payload", type: "Payload" }],
              throws: [],
            },
          },
        },
      },
    },
  },
];

for (const lazy of [false, true]) {
  test(`Observable preserves IDL fields and trailing options (lazy=${lazy})`, async () => {
    const config = {
      metadata,
      namespace: "example",
      serviceName: "Example",
      endpoint: "unused",
      transport: async (bytes: Uint8Array, options: any) => {
        expect(options.signal).toBeInstanceOf(AbortSignal);
        expect(options.headers).toEqual({ authorization: "call" });
        const reader = new BinaryReader(bytes);
        const header = reader.readMessageBegin();
        reader.readFieldBegin();
        reader.readFieldBegin();
        expect(reader.readString()).toBe("IDL headers");
        reader.readFieldBegin();
        expect(reader.readString()).toBe("IDL data");
        const writer = new BinaryWriter();
        writer.writeMessageBegin(header.name, MessageType.Reply, header.sequenceId);
        writer.writeFieldBegin(12, 0);
        writer.writeFieldBegin(11, 2);
        writer.writeString("result");
        writer.writeFieldStop();
        writer.writeFieldStop();
        return writer.finish();
      },
    };
    const raw = lazy
      ? createLazyMetadataClient<any>(config)
      : await createMetadataClient<any>(config);
    const client = toObservableClient(raw);
    const resultClient = toObservableClient(raw[THRIFT_RESULT]);
    expect(
      await firstValueFrom(
        resultClient.echo(
          { headers: "IDL headers", data: "IDL data" },
          { headers: { authorization: "call" } },
        ),
      ),
    ).toEqual({ data: "result" });
    expect(
      await firstValueFrom(
        client.echo(
          { headers: "IDL headers", data: "IDL data" },
          { headers: { authorization: "call" } },
        ),
      ),
    ).toEqual({ data: "result" });
    expect(
      await firstValueFrom(
        client
          .echo(
            { headers: "IDL headers", data: "IDL data" },
            { headers: { authorization: "call" } },
          )
          .pipe(catchThriftResult()),
      ),
    ).toEqual({ data: { data: "result" }, error: undefined });
  });
}

test("unsubscription before metadata loads prevents transport execution", async () => {
  let resolve!: (value: Metadata[]) => void;
  let requests = 0;
  const raw = createLazyMetadataClient({
    metadata: () =>
      new Promise<Metadata[]>((r) => {
        resolve = r;
      }),
    namespace: "example",
    serviceName: "Example",
    endpoint: "unused",
    transport: async () => {
      requests++;
      return new Uint8Array();
    },
  });
  const sub = toObservableClient(raw).echo({}).subscribe();
  sub.unsubscribe();
  resolve(metadata);
  await new Promise((r) => setTimeout(r, 0));
  expect(requests).toBe(0);
});

for (const lazy of [false, true]) {
  test(`Result client preserves IDL headers and cancels transport (lazy=${lazy})`, async () => {
    let signal: AbortSignal | undefined;
    let started!: () => void;
    const pending = new Promise<void>((resolve) => {
      started = resolve;
    });
    const config = {
      metadata,
      namespace: "example",
      serviceName: "Example",
      endpoint: "unused",
      transport: (bytes: Uint8Array, options?: { signal?: AbortSignal }) => {
        const reader = new BinaryReader(bytes);
        reader.readMessageBegin();
        reader.readFieldBegin();
        reader.readFieldBegin();
        expect(reader.readString()).toBe("IDL headers");
        signal = options?.signal;
        started();
        return new Promise<Uint8Array>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(signal?.reason), { once: true });
        });
      },
    };
    const raw = lazy
      ? createLazyMetadataClient<any>(config)
      : await createMetadataClient<any>(config);
    const subscription = toObservableClient(raw[THRIFT_RESULT])
      .echo({ headers: "IDL headers" })
      .subscribe();
    await pending;
    expect(signal).toBeInstanceOf(AbortSignal);
    subscription.unsubscribe();
    expect(signal?.aborted).toBe(true);
  });
}
