---
"@vality/tsthrift-cli": minor
---

Support metadata-only namespace exports at `<package>/<namespace>/metadata`, backed by
generated namespace loaders with build markers and transitive include loading. Prefer
these exports for external metadata discovery, compatibility checks, and generated
runtime imports. Preserve namespace entrypoint fallback for existing protocol packages.
