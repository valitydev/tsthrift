import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    deps: { neverBundle: ["@vality/tsthrift"] },
    entry: ["src/index.ts", "src/cli.ts"],
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
