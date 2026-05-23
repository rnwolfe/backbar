import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DB } from "./client";

export const MIGRATIONS_DIR = join(import.meta.dir, "..", "migrations");

const FILE_RE = /^(\d{4,})_[a-z0-9-]+\.sql$/i;

export interface Applied {
  version: string;
  applied_at: number;
}

function ensureRegistry(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version    TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);
}

function discover(dir: string = MIGRATIONS_DIR): { version: string; file: string }[] {
  return readdirSync(dir)
    .filter((f) => FILE_RE.test(f))
    .sort()
    .map((file) => ({ version: file.split("_", 1)[0]!, file }));
}

/**
 * Apply any pending migrations in `dir`, tracked in `_migrations`.
 * Returns the versions newly applied (in order).
 */
export function migrate(db: DB, dir: string = MIGRATIONS_DIR): string[] {
  ensureRegistry(db);
  const all = discover(dir);
  const applied = new Set(
    db
      .query<{ version: string }, []>("SELECT version FROM _migrations")
      .all()
      .map((r) => r.version),
  );

  const ran: string[] = [];
  for (const { version, file } of all) {
    if (applied.has(version)) continue;
    const sql = readFileSync(join(dir, file), "utf8");
    db.transaction(() => {
      db.exec(sql);
      db.run("INSERT INTO _migrations(version, applied_at) VALUES (?, ?)", [
        version,
        Date.now(),
      ]);
    })();
    ran.push(version);
  }
  return ran;
}

/** Rebuild `bottle.level_ml` from the latest reading per bottle (§5). */
export function rebuildLevels(db: DB): void {
  db.exec(`
    UPDATE bottle SET level_ml = COALESCE((
      SELECT level_ml FROM reading
      WHERE bottle_id = bottle.id
      ORDER BY ts DESC LIMIT 1
    ), bottle.level_ml);
  `);
}

export function appliedVersions(db: DB): Applied[] {
  ensureRegistry(db);
  return db
    .query<Applied, []>("SELECT version, applied_at FROM _migrations ORDER BY version")
    .all();
}
