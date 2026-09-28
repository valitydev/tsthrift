import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {},
  lint: {
    options: { typeAware: true, typeCheck: true },
  },
  run: {
    cache: true,
    tasks: {
      "test:packages": {
        command: "node scripts/package-smoke.mjs",
        dependsOn: ["build"],
        cache: false,
      },
      "test:browser": {
        command: "node scripts/browser-smoke.mjs",
        dependsOn: ["build"],
        cache: false,
      },
      "test:conformance": {
        command: "vp -C packages/cli test --config conformance.config.ts",
        dependsOn: ["build"],
        cache: false,
      },
    },
  },
});
