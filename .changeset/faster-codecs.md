---
"@vality/tsthrift": patch
---

Speed up encoding and decoding. `BinaryWriter` and `BinaryReader` handle short ASCII strings in
JavaScript, and `BinaryWriter` encodes other strings of up to 4096 characters directly into its
buffer. The metadata client decodes structs and lists and assembles call arguments with less
overhead. The wire format and decoded values are unchanged; fields and arguments named `__proto__`
remain own data properties.
