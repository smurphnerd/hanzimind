import process from "node:process";

import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

const projectDir = process.cwd();
loadEnvConfig(
  projectDir,

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
  // Where the journal lives. These are drizzle's defaults, stated because
  // `docs/remote-setup.md` sends an operator to this exact table during the
  // production cutover, and a table you name in a runbook should not be a
  // default that a minor release can move. `src/server/database/migrate.ts` is
  // the runner the app uses and it repeats them; the two must agree, so change
  // both or neither.
  migrations: {
    schema: "drizzle",
    table: "__drizzle_migrations",
  },
});
