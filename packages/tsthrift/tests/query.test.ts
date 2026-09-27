import { describe, expect, test, vi } from "vite-plus/test";
import {
  createThriftMutationOptions,
  createThriftQueryKey,
  createThriftQueryOptions,
  normalizeCacheKey,
} from "../src/query/index.ts";

describe("TanStack Query adapter", () => {
  test("normalizes primitives and complex data structures deterministically", () => {
    expect(normalizeCacheKey(42n)).toBe("42n");
    expect(normalizeCacheKey(new Uint8Array([0xde, 0xad]))).toBe("binary:dead");

    // Object key order does not affect normalized output
    const objA = { b: 2, a: 1 };
    const objB = { a: 1, b: 2 };
    expect(JSON.stringify(normalizeCacheKey(objA))).toBe(JSON.stringify(normalizeCacheKey(objB)));

    // Set
    const set = new Set(["z", "a"]);
    expect(normalizeCacheKey(set)).toEqual(["a", "z"]);

    // Map
    const map = new Map([
      ["b", 2n],
      ["a", 1n],
    ]);
    expect(normalizeCacheKey(map)).toEqual([
      ["a", "1n"],
      ["b", "2n"],
    ]);
  });

  test("creates structured query key with service, method, args, and scope", () => {
    const key = createThriftQueryKey("PaymentService", "getPayment", ["pay-123", 100n], {
      tenant: "vality",
    });
    expect(key).toEqual(["PaymentService", "getPayment", "pay-123", "100n", { tenant: "vality" }]);
  });

  test("createThriftQueryOptions forwards AbortSignal to client call", async () => {
    const mockCall = vi.fn(async (id: string, opts?: { signal?: AbortSignal }) => {
      expect(opts?.signal).toBeDefined();
      return `payment-${id}`;
    });

    const mockClient = {
      getPayment: mockCall,
    };

    const controller = new AbortController();
    const queryOptions = createThriftQueryOptions("PaymentService", mockClient, "getPayment", [
      "123",
    ]);

    expect(queryOptions.queryKey).toEqual(["PaymentService", "getPayment", "123"]);

    const result = await queryOptions.queryFn({ signal: controller.signal });
    expect(result).toBe("payment-123");
    expect(mockCall).toHaveBeenCalledTimes(1);
  });

  test("createThriftMutationOptions executes client method with variables", async () => {
    const mockCall = vi.fn(async (amount: bigint, currency: string) => ({
      status: "success",
      amount,
      currency,
    }));

    const mockClient = {
      createPayment: mockCall,
    };

    const mutationOptions = createThriftMutationOptions(
      "PaymentService",
      mockClient,
      "createPayment",
    );

    const result = await mutationOptions.mutationFn([500n, "USD"]);
    expect(result).toEqual({ status: "success", amount: 500n, currency: "USD" });
    expect(mockCall).toHaveBeenCalledWith(500n, "USD", undefined);
  });
});
