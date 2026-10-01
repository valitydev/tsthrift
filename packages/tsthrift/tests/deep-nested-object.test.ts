import { createRequire } from "node:module";
import { describe, expect, test } from "vite-plus/test";
import { type Metadata, createMetadataClient } from "../src/index.ts";

const require = createRequire(import.meta.url);
const { TBinaryProtocol, TBufferedTransport, fromBigInt, toBigInt } = require("thrift") as {
  TBinaryProtocol: any;
  TBufferedTransport: any;
  fromBigInt: (val: bigint) => any;
  toBigInt: (val: any) => bigint;
};

function encodeWithApache(fn: (proto: any) => void): Uint8Array {
  let output = new Uint8Array();
  const transport = new TBufferedTransport(undefined, (bytes: Buffer) => {
    output = new Uint8Array(bytes);
  });
  const protocol = new TBinaryProtocol(transport);
  fn(protocol);
  transport.flush();
  return output;
}

function decodeWithApache<T>(bytes: Uint8Array, fn: (proto: any) => T): T {
  let result!: T;
  TBufferedTransport.receiver((transport: any) => {
    try {
      const protocol = new TBinaryProtocol(transport);
      result = fn(protocol);
    } catch (err) {
      console.error("decodeWithApache error:", err);
      throw err;
    }
  })(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  return result;
}

interface AttributeKey {
  keyId: string;
  priority: number;
}

interface AttributeValue {
  textValue?: string;
  intValue?: bigint;
  listValue?: string[];
}

interface TreeNode {
  id: bigint;
  label: string;
  payload?: Uint8Array;
  tags: Set<string>;
  attributes: Map<AttributeKey, AttributeValue>;
  children: TreeNode[];
}

interface TreeContainer {
  rootName: string;
  rootNode: TreeNode;
  nodeIndex: Map<string, TreeNode>;
}

const deepNestedMetadata: Metadata[] = [
  {
    name: "tree",
    path: "tree.thrift",
    ast: {
      union: {
        AttributeValue: [
          { id: 1, name: "textValue", type: "string" },
          { id: 2, name: "intValue", type: "i64" },
          { id: 3, name: "listValue", type: { name: "list", valueType: "string" } },
        ],
      },
      struct: {
        AttributeKey: [
          { id: 1, name: "keyId", type: "string" },
          { id: 2, name: "priority", type: "i32" },
        ],
        TreeNode: [
          { id: 1, name: "id", type: "i64" },
          { id: 2, name: "label", type: "string" },
          { id: 3, name: "payload", type: "binary", option: "optional" },
          { id: 4, name: "tags", type: { name: "set", valueType: "string" } },
          {
            id: 5,
            name: "attributes",
            type: { name: "map", keyType: "AttributeKey", valueType: "AttributeValue" },
          },
          { id: 6, name: "children", type: { name: "list", valueType: "TreeNode" } },
        ],
        TreeContainer: [
          { id: 1, name: "rootName", type: "string" },
          { id: 2, name: "rootNode", type: "TreeNode" },
          {
            id: 3,
            name: "nodeIndex",
            type: { name: "map", keyType: "string", valueType: "TreeNode" },
          },
        ],
      },
      service: {
        TreeService: {
          functions: {
            processTree: {
              name: "processTree",
              type: "TreeContainer",
              args: [{ id: 1, name: "container", type: "TreeContainer" }],
              throws: [],
              oneway: false,
            },
          },
        },
      },
    },
  },
];

/** Recursively builds a branching tree of TreeNodes. */
function buildBranchingTree(
  maxDepth: number,
  branchingFactor: number,
  currentDepth = 0,
  index = 0,
): TreeNode {
  const isLeaf = currentDepth >= maxDepth;
  const children: TreeNode[] = [];
  if (!isLeaf) {
    for (let b = 0; b < branchingFactor; b++) {
      children.push(buildBranchingTree(maxDepth, branchingFactor, currentDepth + 1, b));
    }
  }

  const key: AttributeKey = {
    keyId: `attr-k-${currentDepth}-${index}`,
    priority: currentDepth * 10 + index,
  };

  const value: AttributeValue =
    currentDepth % 2 === 0
      ? { textValue: `Depth ${currentDepth} text payload with UTF-8: Привет 🌲 # ${index}` }
      : { intValue: 9007199254740991n + BigInt(currentDepth * 100 + index) };

  const attributes = new Map<AttributeKey, AttributeValue>([[key, value]]);

  return {
    id: BigInt(currentDepth * 100_000 + index + 1),
    label: `TreeNode-L${currentDepth}-I${index}-🔥`,
    payload: new Uint8Array([currentDepth, index, 0xca, 0xfe]),
    tags: new Set([`lvl-${currentDepth}`, `node-${index}`, "branching-tree"]),
    attributes,
    children,
  };
}

/** Recursively builds a deeply nested linear chain of TreeNodes. */
function buildLinearChain(depth: number): TreeNode {
  let current: TreeNode = {
    id: BigInt(depth),
    label: `Leaf-Node-${depth}`,
    payload: new Uint8Array([depth & 0xff]),
    tags: new Set([`depth-${depth}`]),
    attributes: new Map([
      [{ keyId: `chain-key-${depth}`, priority: depth }, { textValue: `leaf-value-${depth}` }],
    ]),
    children: [],
  };

  for (let d = depth - 1; d >= 0; d--) {
    current = {
      id: BigInt(d),
      label: `Chain-Node-${d}`,
      payload: new Uint8Array([d & 0xff]),
      tags: new Set([`depth-${d}`]),
      attributes: new Map([[{ keyId: `chain-key-${d}`, priority: d }, { textValue: `val-${d}` }]]),
      children: [current],
    };
  }

  return current;
}

/** Apache Thrift helper to serialize a TreeNode recursively using TBinaryProtocol. */
function writeApacheTreeNode(proto: any, node: TreeNode): void {
  proto.writeStructBegin("TreeNode");

  // Field 1: id (i64)
  proto.writeFieldBegin("id", 10, 1);
  proto.writeI64(fromBigInt(node.id));
  proto.writeFieldEnd();

  // Field 2: label (string)
  proto.writeFieldBegin("label", 11, 2);
  proto.writeString(node.label);
  proto.writeFieldEnd();

  // Field 3: payload (binary)
  if (node.payload) {
    proto.writeFieldBegin("payload", 11, 3);
    proto.writeBinary(Buffer.from(node.payload));
    proto.writeFieldEnd();
  }

  // Field 4: tags (set<string>)
  proto.writeFieldBegin("tags", 14, 4);
  proto.writeSetBegin(11, node.tags.size);
  for (const tag of node.tags) {
    proto.writeString(tag);
  }
  proto.writeSetEnd();
  proto.writeFieldEnd();

  // Field 5: attributes (map<AttributeKey, AttributeValue>)
  proto.writeFieldBegin("attributes", 13, 5);
  proto.writeMapBegin(12, 12, node.attributes.size);
  for (const [k, v] of node.attributes) {
    // Key: AttributeKey struct
    proto.writeStructBegin("AttributeKey");
    proto.writeFieldBegin("keyId", 11, 1);
    proto.writeString(k.keyId);
    proto.writeFieldEnd();
    proto.writeFieldBegin("priority", 8, 2);
    proto.writeI32(k.priority);
    proto.writeFieldEnd();
    proto.writeFieldStop();
    proto.writeStructEnd();

    // Value: AttributeValue union
    proto.writeStructBegin("AttributeValue");
    if (v.textValue !== undefined) {
      proto.writeFieldBegin("textValue", 11, 1);
      proto.writeString(v.textValue);
      proto.writeFieldEnd();
    } else if (v.intValue !== undefined) {
      proto.writeFieldBegin("intValue", 10, 2);
      proto.writeI64(fromBigInt(v.intValue));
      proto.writeFieldEnd();
    } else if (v.listValue !== undefined) {
      proto.writeFieldBegin("listValue", 15, 3);
      proto.writeListBegin(11, v.listValue.length);
      for (const item of v.listValue) {
        proto.writeString(item);
      }
      proto.writeListEnd();
      proto.writeFieldEnd();
    }
    proto.writeFieldStop();
    proto.writeStructEnd();
  }
  proto.writeMapEnd();
  proto.writeFieldEnd();

  // Field 6: children (list<TreeNode>)
  proto.writeFieldBegin("children", 15, 6);
  proto.writeListBegin(12, node.children.length);
  for (const child of node.children) {
    writeApacheTreeNode(proto, child);
  }
  proto.writeListEnd();
  proto.writeFieldEnd();

  proto.writeFieldStop();
  proto.writeStructEnd();
}

/** Apache Thrift helper to serialize TreeContainer. */
function writeApacheTreeContainer(proto: any, container: TreeContainer): void {
  proto.writeStructBegin("TreeContainer");

  // Field 1: rootName (string)
  proto.writeFieldBegin("rootName", 11, 1);
  proto.writeString(container.rootName);
  proto.writeFieldEnd();

  // Field 2: rootNode (TreeNode)
  proto.writeFieldBegin("rootNode", 12, 2);
  writeApacheTreeNode(proto, container.rootNode);
  proto.writeFieldEnd();

  // Field 3: nodeIndex (map<string, TreeNode>)
  proto.writeFieldBegin("nodeIndex", 13, 3);
  proto.writeMapBegin(11, 12, container.nodeIndex.size);
  for (const [k, node] of container.nodeIndex) {
    proto.writeString(k);
    writeApacheTreeNode(proto, node);
  }
  proto.writeMapEnd();
  proto.writeFieldEnd();

  proto.writeFieldStop();
  proto.writeStructEnd();
}

/** Apache Thrift helper to deserialize a TreeNode recursively using TBinaryProtocol. */
function readApacheTreeNode(proto: any): TreeNode {
  proto.readStructBegin();
  let id = 0n;
  let label = "";
  let payload: Uint8Array | undefined;
  const tags = new Set<string>();
  const attributes = new Map<AttributeKey, AttributeValue>();
  const children: TreeNode[] = [];

  while (true) {
    const field = proto.readFieldBegin();
    if (field.ftype === 0) break; // STOP

    switch (field.fid) {
      case 1: // id (i64)
        id = toBigInt(proto.readI64());
        break;
      case 2: // label (string)
        label = proto.readString();
        break;
      case 3: // payload (binary)
        payload = new Uint8Array(proto.readBinary());
        break;
      case 4: {
        // tags (set<string>)
        const setHeader = proto.readSetBegin();
        for (let i = 0; i < setHeader.size; i++) {
          tags.add(proto.readString());
        }
        proto.readSetEnd();
        break;
      }
      case 5: {
        // attributes (map<AttributeKey, AttributeValue>)
        const mapHeader = proto.readMapBegin();
        for (let i = 0; i < mapHeader.size; i++) {
          // Key
          proto.readStructBegin();
          let keyId = "";
          let priority = 0;
          while (true) {
            const kf = proto.readFieldBegin();
            if (kf.ftype === 0) break;
            if (kf.fid === 1) keyId = proto.readString();
            else if (kf.fid === 2) priority = proto.readI32();
            else proto.skip(kf.ftype);
            proto.readFieldEnd();
          }
          proto.readStructEnd();

          // Value (union)
          proto.readStructBegin();
          const val: AttributeValue = {};
          while (true) {
            const vf = proto.readFieldBegin();
            if (vf.ftype === 0) break;
            if (vf.fid === 1) val.textValue = proto.readString();
            else if (vf.fid === 2) val.intValue = toBigInt(proto.readI64());
            else if (vf.fid === 3) {
              const lh = proto.readListBegin();
              val.listValue = [];
              for (let l = 0; l < lh.size; l++) val.listValue.push(proto.readString());
              proto.readListEnd();
            } else proto.skip(vf.ftype);
            proto.readFieldEnd();
          }
          proto.readStructEnd();

          attributes.set({ keyId, priority }, val);
        }
        proto.readMapEnd();
        break;
      }
      case 6: {
        // children (list<TreeNode>)
        const listHeader = proto.readListBegin();
        for (let i = 0; i < listHeader.size; i++) {
          children.push(readApacheTreeNode(proto));
        }
        proto.readListEnd();
        break;
      }
      default:
        proto.skip(field.ftype);
        break;
    }
    proto.readFieldEnd();
  }

  proto.readStructEnd();
  return { id, label, payload, tags, attributes, children };
}

/** Apache Thrift helper to deserialize TreeContainer. */
function readApacheTreeContainer(proto: any): TreeContainer {
  proto.readStructBegin();
  let rootName = "";
  let rootNode!: TreeNode;
  const nodeIndex = new Map<string, TreeNode>();

  while (true) {
    const field = proto.readFieldBegin();
    if (field.ftype === 0) break;

    switch (field.fid) {
      case 1:
        rootName = proto.readString();
        break;
      case 2:
        rootNode = readApacheTreeNode(proto);
        break;
      case 3: {
        const mh = proto.readMapBegin();
        for (let i = 0; i < mh.size; i++) {
          const key = proto.readString();
          const node = readApacheTreeNode(proto);
          nodeIndex.set(key, node);
        }
        proto.readMapEnd();
        break;
      }
      default:
        proto.skip(field.ftype);
        break;
    }
    proto.readFieldEnd();
  }

  proto.readStructEnd();
  return { rootName, rootNode, nodeIndex };
}

describe("Binary format on large nested composite objects", () => {
  test("exact byte-for-byte wire parity between tsthrift and Apache 0.24 on a large tree (364 nodes)", async () => {
    // Tree of depth 5 with branching factor 3 => 1 + 3 + 9 + 27 + 81 + 243 = 364 nodes
    const root = buildBranchingTree(5, 3);
    const container: TreeContainer = {
      rootName: "LargeEnterpriseBranchingTree",
      rootNode: root,
      nodeIndex: new Map([
        ["root-ref", root],
        ["first-child", root.children[0]],
      ]),
    };

    let ourEncodedRequestBytes!: Uint8Array;

    const client = await createMetadataClient<{
      processTree: (container: TreeContainer) => Promise<TreeContainer>;
    }>({
      endpoint: "unused",
      binaryMode: "uint8array",
      namespace: "tree",
      serviceName: "TreeService",
      metadata: deepNestedMetadata,
      transport: async (requestBytes) => {
        ourEncodedRequestBytes = requestBytes;
        // Return dummy response
        return encodeWithApache((proto) => {
          proto.writeMessageBegin("processTree", 2, 1);
          proto.writeStructBegin("processTree_result");
          proto.writeFieldBegin("success", 12, 0);
          writeApacheTreeContainer(proto, container);
          proto.writeFieldEnd();
          proto.writeFieldStop();
          proto.writeStructEnd();
          proto.writeMessageEnd();
        });
      },
    });

    await client.processTree(container);

    // Now encode the exact same call via official Apache Thrift
    const apacheRequestBytes = encodeWithApache((proto) => {
      proto.writeMessageBegin("processTree", 1, 1); // CALL, seqId 1
      proto.writeStructBegin("processTree_args");
      proto.writeFieldBegin("container", 12, 1);
      writeApacheTreeContainer(proto, container);
      proto.writeFieldEnd();
      proto.writeFieldStop();
      proto.writeStructEnd();
      proto.writeMessageEnd();
    });

    expect(ourEncodedRequestBytes.byteLength).toBeGreaterThan(30_000); // Over 30 KB of structured binary data
    expect(ourEncodedRequestBytes.byteLength).toBe(apacheRequestBytes.byteLength);

    // Byte-for-byte exact equality across the entire 30+ KB binary message
    expect(Buffer.from(ourEncodedRequestBytes).toString("hex")).toBe(
      Buffer.from(apacheRequestBytes).toString("hex"),
    );
  });

  test("bidirectional end-to-end roundtrip between tsthrift client and Apache server on nested tree", async () => {
    const root = buildBranchingTree(4, 2); // 1 + 2 + 4 + 8 + 16 = 31 nodes
    const inputContainer: TreeContainer = {
      rootName: "RoundtripContainer",
      rootNode: root,
      nodeIndex: new Map([["root", root]]),
    };

    let serverDecodedContainer!: TreeContainer;

    const client = await createMetadataClient<{
      processTree: (container: TreeContainer) => Promise<TreeContainer>;
    }>({
      endpoint: "unused",
      binaryMode: "uint8array",
      namespace: "tree",
      serviceName: "TreeService",
      metadata: deepNestedMetadata,
      transport: async (requestBytes) => {
        // 1. Apache server decodes the request produced by our client
        decodeWithApache(requestBytes, (proto) => {
          const msg = proto.readMessageBegin();
          expect(msg.fname).toBe("processTree");
          expect(msg.mtype).toBe(1);

          proto.readStructBegin();
          const argField = proto.readFieldBegin();
          expect(argField.fid).toBe(1);

          serverDecodedContainer = readApacheTreeContainer(proto);
          proto.readFieldEnd();

          const stopField = proto.readFieldBegin();
          expect(stopField.ftype).toBe(0);
          proto.readStructEnd();
          proto.readMessageEnd();
        });

        // 2. Apache server transforms tree by adding an extra leaf node and replies
        const modifiedRoot: TreeNode = {
          ...serverDecodedContainer.rootNode,
          label: "Server-Modified-Root",
          children: [
            ...serverDecodedContainer.rootNode.children,
            {
              id: 999_999n,
              label: "New-Node-From-Apache-Server",
              payload: new Uint8Array([0xaa, 0xbb]),
              tags: new Set(["server-injected"]),
              attributes: new Map([
                [{ keyId: "server-key", priority: 999 }, { textValue: "server-ok" }],
              ]),
              children: [],
            },
          ],
        };

        const replyContainer: TreeContainer = {
          rootName: "Server-Reply-Container",
          rootNode: modifiedRoot,
          nodeIndex: new Map([["modified-root", modifiedRoot]]),
        };

        // 3. Apache server encodes response
        return encodeWithApache((proto) => {
          proto.writeMessageBegin("processTree", 2, 1); // REPLY
          proto.writeStructBegin("processTree_result");
          proto.writeFieldBegin("success", 12, 0);
          writeApacheTreeContainer(proto, replyContainer);
          proto.writeFieldEnd();
          proto.writeFieldStop();
          proto.writeStructEnd();
          proto.writeMessageEnd();
        });
      },
    });

    const result = await client.processTree(inputContainer);

    // Validate that Apache decoded our complex structure accurately
    expect(serverDecodedContainer.rootName).toBe("RoundtripContainer");
    expect(serverDecodedContainer.rootNode.id).toBe(inputContainer.rootNode.id);
    expect(serverDecodedContainer.rootNode.label).toBe(inputContainer.rootNode.label);
    expect(serverDecodedContainer.rootNode.tags).toEqual(inputContainer.rootNode.tags);
    expect(serverDecodedContainer.rootNode.payload).toEqual(inputContainer.rootNode.payload);
    expect(serverDecodedContainer.rootNode.children.length).toBe(2);

    // Validate that our client parsed Apache's complex reply correctly
    expect(result.rootName).toBe("Server-Reply-Container");
    expect(result.rootNode.label).toBe("Server-Modified-Root");
    expect(result.rootNode.children.length).toBe(3);
    const injectedChild = result.rootNode.children[2]!;
    expect(injectedChild.id).toBe(999_999n);
    expect(injectedChild.label).toBe("New-Node-From-Apache-Server");
    expect(injectedChild.payload).toEqual(new Uint8Array([0xaa, 0xbb]));
    expect(injectedChild.tags).toEqual(new Set(["server-injected"]));
    expect(injectedChild.attributes.size).toBe(1);
    const [attrEntry] = [...injectedChild.attributes.entries()];
    expect(attrEntry[0].keyId).toBe("server-key");
    expect(attrEntry[1].textValue).toBe("server-ok");
  });

  test("deep linear recursion: chain of 25 nested levels roundtrips cleanly", async () => {
    const depth = 25; // 25 nodes = 50 levels of Thrift nesting (node -> children list -> node)
    const chainRoot = buildLinearChain(depth);
    const container: TreeContainer = {
      rootName: `DeepChain-${depth}`,
      rootNode: chainRoot,
      nodeIndex: new Map([["deep-chain", chainRoot]]),
    };

    let capturedApacheDepth = 0;

    const client = await createMetadataClient<{
      processTree: (container: TreeContainer) => Promise<TreeContainer>;
    }>({
      endpoint: "unused",
      binaryMode: "uint8array",
      namespace: "tree",
      serviceName: "TreeService",
      metadata: deepNestedMetadata,
      transport: async (requestBytes) => {
        // Apache decodes the deep chain
        decodeWithApache(requestBytes, (proto) => {
          proto.readMessageBegin();
          proto.readStructBegin();
          proto.readFieldBegin();
          const decoded = readApacheTreeContainer(proto);
          let curr: TreeNode | undefined = decoded.rootNode;
          while (curr) {
            capturedApacheDepth++;
            curr = curr.children[0];
          }
          proto.readFieldEnd();
          proto.readFieldBegin();
          proto.readStructEnd();
          proto.readMessageEnd();
        });

        // Apache sends the deep chain back in response
        return encodeWithApache((proto) => {
          proto.writeMessageBegin("processTree", 2, 1);
          proto.writeStructBegin("processTree_result");
          proto.writeFieldBegin("success", 12, 0);
          writeApacheTreeContainer(proto, container);
          proto.writeFieldEnd();
          proto.writeFieldStop();
          proto.writeStructEnd();
          proto.writeMessageEnd();
        });
      },
    });

    const result = await client.processTree(container);

    expect(capturedApacheDepth).toBe(depth + 1); // 0 to 25 inclusive = 26 nodes
    expect(result.rootName).toBe(`DeepChain-${depth}`);

    // Verify all 26 levels in client result
    let clientDepth = 0;
    let nodePtr: TreeNode | undefined = result.rootNode;
    while (nodePtr) {
      expect(nodePtr.id).toBe(BigInt(clientDepth));
      clientDepth++;
      nodePtr = nodePtr.children[0];
    }
    expect(clientDepth).toBe(depth + 1);
  });

  test("nesting depth guard safely rejects maliciously deep hierarchies (>64 levels)", async () => {
    const maliciousDepth = 40; // 40 nodes = 80 nesting levels, exceeds MAX_NESTING_DEPTH (64)
    const deepChain = buildLinearChain(maliciousDepth);
    const container: TreeContainer = {
      rootName: "MaliciousChain",
      rootNode: deepChain,
      nodeIndex: new Map(),
    };

    const client = await createMetadataClient<{
      processTree: (container: TreeContainer) => Promise<TreeContainer>;
    }>({
      endpoint: "unused",
      binaryMode: "uint8array",
      namespace: "tree",
      serviceName: "TreeService",
      metadata: deepNestedMetadata,
      transport: async () => new Uint8Array(),
    });

    await expect(client.processTree(container)).rejects.toThrow(RangeError);
  });
});
