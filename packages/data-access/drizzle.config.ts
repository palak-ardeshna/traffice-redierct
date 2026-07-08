import { defineConfig } from "drizzle-kit";

/**
 * Desktop dialect = SQLite. The cloud build (§21) swaps `dialect: "postgresql"`
 * and points at the Postgres schema; the authored tables are identical (ADR 0003).
 */
export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.FLOWPILOT_DB_URL ?? "./.flowpilot-data/flowpilot.sqlite",
  },
  strict: true,
  verbose: true,
});
