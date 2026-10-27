import { defineConfig } from "vitest/config";
import path from "path";

// Server-side unit/integration tests. Aliases mirror tsconfig.base.json paths.
export default defineConfig({
  resolve: {
    alias: {
      "@wtrops/shared": path.resolve(__dirname, "libs/shared/src/index.ts"),
      "@wtrops/core": path.resolve(__dirname, "libs/core/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["apps/server/src/**/*.test.ts", "libs/**/*.test.ts"],
    exclude: ["**/node_modules/**", "dist/**", "video-kg/**", "image-kg/**"],
  },
});
