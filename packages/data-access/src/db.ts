/**
 * SQLite connection factory (desktop). better-sqlite3 is synchronous → ideal for
 * a local single-process desktop DB. WAL mode for concurrent reads during runs.
 */

import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "./schema.js";

export type Db = BetterSQLite3Database<typeof schema>;

export function createDb(filePath: string): Db {
  const sqlite = new Database(filePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}
