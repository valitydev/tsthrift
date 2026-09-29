import { wrapObservableClient } from "../src/observable-client.ts";
import { expect, expectTypeOf, test } from "vite-plus/test";
import { type Observable, firstValueFrom, of, throwError } from "rxjs";
import {
  BinaryReader,
  BinaryWriter,
  MessageType,
  type Metadata,
  ThriftServiceError,
  createMetadataClient,
} from "@vality/tsthrift";
import { catchThriftError, catchThriftResult } from "../src/index.ts";

const metadata: Metadata[] = [
  {
    name: "test",
    path: "test.thrift",
    ast: {
      exception: { Missing: [{ id: 1, name: "reason", type: "string" }] },
      service: {
        Test: {
          functions: {
            get: {
              name: "get",
              type: "void",
              args: [],
              oneway: false,
              throws: [{ id: 1, name: "missing", type: "Missing" }],
            },
          },
        },
      },
    },
  },
];

test("normalizes decoded RPC exceptions for all handler overloads", async () => {
  const client = await createMetadataClient<{ get(): Promise<void> }>({
    metadata,
    namespace: "test",
    serviceName: "Test",
    endpoint: "unused",
    transport: async (bytes) => {
      const header = new BinaryReader(bytes).readMessageBegin();
      const writer = new BinaryWriter();
      writer.writeMessageBegin(header.name, MessageType.Reply, header.sequenceId);
      writer.writeFieldBegin(12, 1);
      writer.writeFieldBegin(11, 1);
      writer.writeString("gone");
      writer.writeFieldStop();
      writer.writeFieldStop();
      return writer.finish();
    },
  });
  const observable = wrapObservableClient(client);
  const result = await firstValueFrom(observable.get().pipe(catchThriftResult()));
  expect(result.error).toBeInstanceOf(ThriftServiceError);
  expect((result.error as ThriftServiceError).data).toEqual({ reason: "gone" });

  const handler = (error: ThriftServiceError<"test.Missing", { reason: string }>) => {
    expect(error).toBeInstanceOf(ThriftServiceError);
    expect(error.type).toBe("test.Missing");
    expect(error.isService).toBe(true);
    return of(error.data.reason);
  };
  await expect(
    firstValueFrom(observable.get().pipe(catchThriftError("test.Missing", handler))),
  ).resolves.toBe("gone");
  await expect(
    firstValueFrom(observable.get().pipe(catchThriftError({ "test.Missing": handler }))),
  ).resolves.toBe("gone");
  await expect(firstValueFrom(observable.get().pipe(catchThriftError(handler)))).resolves.toBe(
    "gone",
  );
});

test("does not match unrelated errors by name", async () => {
  const error = new Error("unrelated");
  error.name = "Missing";
  await expect(
    firstValueFrom(
      throwError(() => error).pipe(catchThriftError({ Missing: () => of("handled") })),
    ),
  ).rejects.toBe(error);
});

test("retains recovery values in the output type", () => {
  const source = of("ok");
  expectTypeOf(source.pipe(catchThriftError("Missing", () => of(123)))).toEqualTypeOf<
    Observable<string | number>
  >();
  expectTypeOf(source.pipe(catchThriftError({ Missing: () => of(123) }))).toEqualTypeOf<
    Observable<string | number>
  >();
  expectTypeOf(source.pipe(catchThriftError(() => of(123)))).toEqualTypeOf<
    Observable<string | number>
  >();
});
