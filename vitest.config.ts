import react from "@vitejs/plugin-react";
import path from "path";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    reporters: ["default", "junit"],
    outputFile: {
      junit: "test-results/vitest/junit.xml",
    },
    testTimeout: 20000,
    environment: "node",
  },
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "./test/mocks/server-only.ts"),
    },
  },
});
