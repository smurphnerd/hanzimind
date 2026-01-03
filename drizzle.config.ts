import process from "node:process";
import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

const projectDir = process.cwd();
loadEnvConfig(projectDir, process.env.NODE_ENV !== "production");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not set. Ensure .env is in the project root and contains DATABASE_URL=..."
  );
}

export default defineConfig({
  out: "./drizzle",
  schema: "./src/server/database/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  casing: "snake_case",
});
