import type { DB } from "@backbar/db";
import { Bus } from "./bus";
import { MakeableCache } from "./makeable";

/**
 * Shared per-process dependencies. Built once at server start, passed into
 * every route handler so the app stays trivially testable (swap `db` for
 * an in-memory one and you're done).
 */
export interface Deps {
  db: DB;
  bus: Bus;
  makeable: MakeableCache;
  /** Required for `/ingest/reading` (HMAC); when absent the route 503s. */
  hmacSecret: string | null;
  /** Where `/menu/publish` writes the snapshot. */
  guestMenuOutDir: string;
}

export function buildDeps(db: DB, env: NodeJS.ProcessEnv = process.env): Deps {
  const bus = new Bus();
  const makeable = new MakeableCache(db);
  makeable.recompute();
  return {
    db,
    bus,
    makeable,
    hmacSecret: env.HMAC_SECRET ?? null,
    guestMenuOutDir: env.GUEST_MENU_OUT_DIR ?? "./guest-menu",
  };
}
