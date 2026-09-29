---
"@vality/tsthrift-angular": minor
---

Require Angular 22 or newer and depend on @vality/tsthrift as a regular dependency. Use explicit argument counts and Result markers, qualified registry keys, root-scoped service tokens, and shared configuration merging. Preserve raw return values in deferThriftCall; unwrap Result values explicitly with the RxJS operator.

Select Promise or Observable service tokens at creation time with createPromiseService and createObservableService. Remove the createServiceToken and catchTypedError aliases. Rename the RxJS unwrapResult operator to unwrapThriftResult to avoid clashing with the core helper.
