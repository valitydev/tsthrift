import { describe, expect, test } from "vite-plus/test";
import { createConverter, type Metadata } from "../src/index.ts";

const sampleMetadata: Metadata[] = [
  {
    path: "base.thrift",
    name: "base",
    ast: {
      typedef: {
        ID: { type: "i64" },
      },
      enum: {
        Status: {
          items: [
            { name: "PENDING", value: 1 },
            { name: "ACTIVE", value: 2 },
          ],
        },
      },
    },
  },
  {
    path: "example.thrift",
    name: "example",
    ast: {
      include: {
        base: { path: "base.thrift" },
      },
      struct: {
        Item: [
          { name: "id", type: "base.ID" },
          { name: "title", type: "string" },
        ],
        Record: [
          { name: "id", type: "string" },
          { name: "value", type: "i64" },
          { name: "tags", type: { name: "set", valueType: "string" } },
          { name: "items", type: { name: "list", valueType: "Item" } },
          { name: "status", type: "base.Status" },
          { name: "meta", type: { name: "map", keyType: "string", valueType: "string" } },
          { name: "extra", type: "Item", option: "optional" },
        ],
      },
      union: {
        Selection: [
          { name: "first", type: "string" },
          { name: "second", type: "string" },
        ],
      },
      exception: {
        AppError: [
          { name: "code", type: "string" },
          { name: "reason", type: "string" },
        ],
      },
    },
  },
];

// Mock Thrift class simulating Apache Thrift generated classes
class MockRecord {
  id?: string;
  value?: bigint;
  tags?: string[];
  items?: any[];
  status?: number;
  meta?: Map<string, string>;
  extra?: any;

  constructor(args?: any) {
    if (args) Object.assign(this, args);
  }

  read() {}
  write() {}
}

class MockItem {
  id?: bigint;
  title?: string;

  constructor(args?: any) {
    if (args) Object.assign(this, args);
  }

  read() {}
  write() {}
}

const classRegistry = {
  example: {
    Record: MockRecord,
    Item: MockItem,
  },
};

describe("ThriftConverter", () => {
  describe("toThriftInstance", () => {
    test("converts plain objects to Thrift class instances recursively", () => {
      const converter = createConverter({
        metadata: sampleMetadata,
        classRegistry,
        i64Mode: "bigint",
      });

      const plain = {
        id: "rec-1",
        value: 1000n,
        tags: new Set(["a", "b"]),
        items: [{ id: 42n, title: "Sample" }],
        status: 2,
        meta: new Map([["key", "value"]]),
      };

      const instance = converter.toThriftInstance(plain, "Record", "example") as any;

      expect(instance).toBeInstanceOf(MockRecord);
      expect(instance.id).toBe("rec-1");
      expect(instance.value).toBe(1000n);
      expect(instance.tags).toEqual(["a", "b"]);
      expect(instance.items[0]).toBeInstanceOf(MockItem);
      expect(instance.items[0].id).toBe(42n);
      expect(instance.items[0].title).toBe("Sample");
      expect(instance.meta).toBeInstanceOf(Map);
      expect(instance.meta.get("key")).toBe("value");
    });

    test("converts numbers to bigint in number mode and enforces safe integer bounds", () => {
      const converter = createConverter({
        metadata: sampleMetadata,
        classRegistry,
        i64Mode: "number",
      });

      const plain = {
        id: "rec-2",
        value: 500,
        tags: new Set(),
        items: [],
        status: 1,
        meta: new Map(),
      };

      const instance = converter.toThriftInstance(plain, "Record", "example") as any;
      expect(instance.value).toBe(500n);

      expect(() => {
        converter.toThriftInstance({ ...plain, value: 9007199254740992 }, "Record", "example");
      }).toThrow(RangeError);
    });

    test("converts union to single-property instance", () => {
      const converter = createConverter({ metadata: sampleMetadata });
      const union = converter.toThriftInstance({ first: "choice-a" }, "Selection", "example");
      expect(union).toEqual({ first: "choice-a" });
    });

    test("preserves empty struct when present", () => {
      const converter = createConverter({
        metadata: sampleMetadata,
        classRegistry,
      });

      const plain = {
        id: "rec-3",
        value: 10n,
        tags: new Set(),
        items: [],
        status: 1,
        meta: new Map(),
        extra: {},
      };

      const instance = converter.toThriftInstance(plain, "Record", "example") as any;
      expect(instance.extra).toBeInstanceOf(MockItem);
    });
  });

  describe("toPlainObject", () => {
    test("converts Thrift instance to clean plain object without methods", () => {
      const converter = createConverter({
        metadata: sampleMetadata,
        i64Mode: "bigint",
      });

      const mockRecord = new MockRecord({
        id: "rec-1",
        value: 1000n,
        tags: ["a", "b"],
        items: [new MockItem({ id: 42n, title: "Sample" })],
        status: 2,
        meta: new Map([["k", "v"]]),
      });

      const plain = converter.toPlainObject(mockRecord, "Record", "example") as any;

      expect(plain.constructor).toBe(Object);
      expect(plain.read).toBeUndefined();
      expect(plain.write).toBeUndefined();
      expect(plain.id).toBe("rec-1");
      expect(plain.value).toBe(1000n);
      expect(plain.tags).toBeInstanceOf(Set);
      expect(plain.tags).toEqual(new Set(["a", "b"]));
      expect(plain.items[0]).toEqual({ id: 42n, title: "Sample" });
      expect(plain.items[0].read).toBeUndefined();
    });

    test("converts bigint to number in number mode and checks bounds", () => {
      const converter = createConverter({
        metadata: sampleMetadata,
        i64Mode: "number",
      });

      const mock = new MockRecord({
        id: "1",
        value: 12345n,
        tags: [],
        items: [],
        status: 1,
        meta: new Map(),
      });

      const plain = converter.toPlainObject(mock, "Record", "example") as any;
      expect(plain.value).toBe(12345);

      const overflowMock = new MockRecord({
        id: "1",
        value: 9007199254740992n,
        tags: [],
        items: [],
        status: 1,
        meta: new Map(),
      });

      expect(() => {
        converter.toPlainObject(overflowMock, "Record", "example");
      }).toThrow(RangeError);
    });

    test("converts union instance to single variant plain object", () => {
      const converter = createConverter({ metadata: sampleMetadata });
      const plain = converter.toPlainObject(
        { first: "choice-a", second: null },
        "Selection",
        "example",
      );
      expect(plain).toEqual({ first: "choice-a" });
    });
  });
});
