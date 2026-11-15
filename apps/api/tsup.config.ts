import { defineConfig } from "tsup";

/** Production build: `pnpm build` → dist/index.js (server) and dist/scripts/seed.js. */
export default defineConfig({
  entry: ["src/index.ts", "src/scripts/seed.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  sourcemap: true,
  // The shared workspace package ships TypeScript source, so bundle it; everything else stays in node_modules.
  noExternal: ["@nova/shared"],
});
