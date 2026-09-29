import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    target: "es2023",
    entry: ["src/index.ts"],
    dts: {
      tsgo: {},
    },
    exports: true,
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});
