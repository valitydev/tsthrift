import { expect, test } from "vite-plus/test";
import {
  ThriftServiceError,
  catchServiceError,
  isThriftServiceError,
  toThriftResult,
} from "../src/index.ts";

test("service errors keep wrapper fields and expose the payload in data", async () => {
  const payload = {
    name: "payload name",
    type: "payload type",
    data: "payload data",
    isService: false,
  };
  const error = new ThriftServiceError("Missing", "missing", payload);
  expect(isThriftServiceError(error, "Missing")).toBe(true);
  expect(error.name).toBe("Missing");
  expect(error.type).toBe("Missing");
  expect(error.isService).toBe(true);
  expect(error.data).toBe(payload);
  expect(catchServiceError(error, "Missing", (caught) => caught.data)).toBe(payload);
  const result = await toThriftResult(Promise.reject(error));
  expect(result.error).toBe(error);
});

test("plain objects and unrelated failures are not service errors", () => {
  expect(isThriftServiceError({ type: "Missing", data: {} })).toBe(false);
  expect(isThriftServiceError(new Error("unrelated"))).toBe(false);
  expect(catchServiceError(new Error("unrelated"), () => "handled")).toBeUndefined();
});
