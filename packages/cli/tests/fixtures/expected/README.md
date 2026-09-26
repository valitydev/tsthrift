# Legacy metadata baseline

`metadata.json` was generated from `../proto/example.thrift` and its reachable
`../dependency/shared/common.thrift` include using the JSON output of
`@vality/thrift-ts@2.5.1-2b658f2.0` (`lib/compile.js`). Each program path is relative
to its input/include root, as in the old CLI.

Keep this as a compatibility fixture rather than regenerating it with tsthrift.
The test compares parsed JSON: formatting is not part of the contract. The AST,
field IDs, typedef references, namespace information, and omitted implicit enum
values are part of the contract.
