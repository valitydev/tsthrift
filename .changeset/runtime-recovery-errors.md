---
"@vality/tsthrift": minor
---

Make metadata loads retryable, validate versioned metadata, and throw qualified service errors with cross-package brands. Bound HTTP error details, isolate logging, preserve call correlation, and accept arbitrary 128-bit UUID values. Tracing IDs keep the backend-compatible Flake layout; FlakeId no longer throws on clock rollback or sequence exhaustion by default (`strict: true` restores upstream behavior); remove the generateTraceId alias. Remove normalizeThriftError, THRIFT_EXCEPTION_INFO, and getThriftExceptionInfo; declared exceptions are always ThriftServiceError instances. createLazyMetadataClient requires the list of method names and exposes only those methods.
