import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["tests/conformance/*.conformance.ts"],
    hookTimeout: 180_000,
    testTimeout: 30_000,
  },
});
