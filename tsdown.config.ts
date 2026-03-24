import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/cli/bin.ts"],
  format: "esm",
  clean: true,
  sourcemap: true,
});
