import { expect, test } from "vite-plus/test";
import {
  THRIFT_EXCEPTION_INFO,
  ThriftServiceError,
  catchServiceError,
  normalizeThriftError,
  toThriftResult,
} from "../src/index.ts";

test("normalizes tagged payloads without overwriting wrapper fields", async () => {
  const payload = {
    name: "payload name",
    type: "payload type",
    data: "payload data",
    isService: false,
  };
  Object.defineProperty(payload, THRIFT_EXCEPTION_INFO, {
    value: { type: "Missing", fieldName: "missing" },
  });
  const error = normalizeThriftError(payload) as ThriftServiceError;
  expect(error).toBeInstanceOf(ThriftServiceError);
  expect(error.name).toBe("Missing");
  expect(error.type).toBe("Missing");
  expect(error.isService).toBe(true);
  expect(error.data).toBe(payload);
  expect(normalizeThriftError(error)).toBe(error);
  expect(catchServiceError(payload, "Missing", (caught) => caught.data)).toBe(payload);
  const result = await toThriftResult(Promise.reject(error));
  expect(result.error).toBe(error);
});

test("preserves unrelated failures", () => {
  const error = new Error("unrelated");
  expect(normalizeThriftError(error)).toBe(error);
  expect(normalizeThriftError(undefined)).toBeUndefined();
});
