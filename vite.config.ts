import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {},
  lint: {
    options: { typeAware: true, typeCheck: true },
    overrides: [
      {
        files: ["packages/tsthrift/src/**/*.ts"],
        rules: {
          "no-restricted-imports": ["error", { patterns: ["node:*", "buffer", "process"] }],
          "no-restricted-globals": [
            "error",
            "Buffer",
            "process",
            "require",
            "__dirname",
            "__filename",
          ],
        },
      },
      {
        files: ["packages/cli/src/**", "**/tests/**", "scripts/**"],
        rules: { "no-console": "off" },
      },
    ],
    rules: {
      "typescript/no-explicit-any": "warn",
      "no-console": "error",
      "sort-imports": [
        "error",
        {
          ignoreDeclarationSort: true,
          ignoreMemberSort: false,
        },
      ],
    },
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
