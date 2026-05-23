import type { DB } from "@backbar/db";
import { Bus } from "./bus";
import { MakeableCache } from "./makeable";

/**
 * Shared per-process dependencies. Built once at server start, passed into
 * every route handler so the app stays trivially testable (swap `db` for
 * an in-memory one and you're done).
 */
export type MenuServeMode = "snapshot" | "caddy";

export interface GuestMenuConfig {
  /** snapshot = bake JSON + (optionally) trigger Vercel deploy hook.
   *  caddy    = live; `/menu/publish` is a no-op (UI reads /guest/menu directly). */
  mode: MenuServeMode;
  /** Where snapshot mode writes `menu.json`. */
  outDir: string;
  /** Vercel "Deploy Hook" URL; when set, snapshot mode POSTs to it after writing
   *  the snapshot so Vercel rebuilds with the fresh data. Optional. */
  vercelDeployHook: string | null;
  /** Public guest URL operators want surfaced in publish responses (Caddy mode
   *  has nothing to write, so this is the canonical reply). */
  publicUrl: string | null;
}

export interface Deps {
  db: DB;
  bus: Bus;
  makeable: MakeableCache;
  /** Required for `/ingest/reading` (HMAC); when absent the route 503s. */
  hmacSecret: string | null;
  /** Where `/menu/publish` writes the snapshot. Kept on Deps for back-compat
   *  with tests; prefer `guestMenu.outDir` going forward. */
  guestMenuOutDir: string;
  guestMenu: GuestMenuConfig;
}

export function buildDeps(db: DB, env: NodeJS.ProcessEnv = process.env): Deps {
  const bus = new Bus();
  const makeable = new MakeableCache(db);
  makeable.recompute();
  const outDir = env.GUEST_MENU_OUT_DIR ?? "./guest-menu";
  const mode: MenuServeMode = env.MENU_SERVE_MODE === "caddy" ? "caddy" : "snapshot";
  return {
    db,
    bus,
    makeable,
    hmacSecret: env.HMAC_SECRET ?? null,
    guestMenuOutDir: outDir,
    guestMenu: {
      mode,
      outDir,
      vercelDeployHook: env.VERCEL_DEPLOY_HOOK ?? null,
      publicUrl: env.GUEST_PUBLIC_URL ?? null,
    },
  };
}
