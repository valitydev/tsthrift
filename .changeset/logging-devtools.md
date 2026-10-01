---
"@vality/tsthrift": minor
---

Add `@vality/tsthrift/devtools` with `createConsoleLogger` and a root `combineLoggers` helper. Error log events now carry a typed `ThriftLogError` summary with HTTP `status` and `TApplicationException` `code`; declared exception `data` is included only with `logPayloads`. Headers and HTTP response bodies remain excluded from logs.
