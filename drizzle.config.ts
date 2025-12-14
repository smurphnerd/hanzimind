import process from "node:process";

import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

const projectDir = process.cwd();
loadEnvConfig(
  projectDir,
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  process.env.NODE_ENV === "development" || process.env.NODE_ENV === undefined,
);

export default defineConfig({
  out: "./drizzle",
  schema: "./src/server/database/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env["DATABASE_URL"] as string,
  },
  casing: "snake_case",
});

