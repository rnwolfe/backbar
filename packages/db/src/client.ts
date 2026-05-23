import { Database } from "bun:sqlite";

const DEFAULT_PATH = process.env.BACKBAR_DB ?? "backbar.db";

export type DB = Database;

/** Open a bun:sqlite database (default: env `BACKBAR_DB` or `./backbar.db`). */
export function open(path: string = DEFAULT_PATH): DB {
  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

/** In-memory DB — useful for tests and ephemeral runs. */
export function openMemory(): DB {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}
