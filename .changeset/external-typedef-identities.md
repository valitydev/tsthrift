---
"@vality/tsthrift-cli": patch
---

Fix false circular typedef errors when external protocol metadata contains same-named
typedefs in different modules. Keep module identities distinct throughout the external
include graph while continuing to reject actual typedef cycles.
