import { expectTypeOf, test } from "vite-plus/test";
import type {
  THRIFT_ERRORS,
  ThriftMethodError,
  ThriftResult,
  ThriftResultClient,
  ThriftServiceError,
} from "@vality/tsthrift";
import type { Observable } from "rxjs";
import type { ObservableClient } from "../src/rxjs.ts";

type Failure = ThriftServiceError<"example.Missing", { id: string }>;
interface Client {
  readonly [THRIFT_ERRORS]?: { echo: Failure };
  echo(value: string): Promise<string>;
}

test("Result and Observable adapters retain parameter types and method errors on the client", () => {
  type Safe = ThriftResultClient<Client>;
  expectTypeOf<ThriftMethodError<Safe, "echo">>().toEqualTypeOf<Failure>();
  expectTypeOf<Parameters<ObservableClient<Safe>["echo"]>>().toEqualTypeOf<[string]>();
  expectTypeOf<ReturnType<ObservableClient<Safe>["echo"]>>().toEqualTypeOf<Observable<string>>();
  expectTypeOf<ReturnType<ObservableClient<Safe, false>["echo"]>>().toEqualTypeOf<
    Observable<ThriftResult<string, Failure>>
  >();
});
