---
"@vality/tsthrift": minor
---

Runtime RPC errors now carry the stack of the call site instead of internal transport frames, including calls through `createLazyMetadataClient`. `ThriftLogError` includes this `stack`, and `createConsoleLogger` prints failures as an `Error` with it.
