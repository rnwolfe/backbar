import type { DB } from "@backbar/db";
import { Bus } from "./bus";
import { MakeableCache } from "./makeable";
import type { ConfigPayload } from "./mqtt";
import { RawSampleCache } from "./rawSampleCache";

/**
 * Shared per-process dependencies. Built once at server start, passed into
 * every route handler so the app stays trivially testable (swap `db` for
 * an in-memory one and you're done).
 */
export interface GuestMenuConfig {
  /** Public guest URL surfaced in publish responses — the menu subdomain
   *  (e.g. https://menu.labs.rwolfe.io). Set via GUEST_PUBLIC_URL. */
  publicUrl: string | null;
}

export interface Deps {
  db: DB;
  bus: Bus;
  makeable: MakeableCache;
  /** Latest raw sample per (device_id, channel) — feeds the calibration UI. */
  rawSamples: RawSampleCache;
  /** Required for `/ingest/reading` (HMAC); when absent the route 503s. */
  hmacSecret: string | null;
  guestMenu: GuestMenuConfig;
  /** Optional MQTT push for config/calibration. When absent (P0/P1, or when
   *  the broker is offline) calibration writes still land in `sensor_channel`
   *  — the firmware will pick them up via the retained config topic on its
   *  next connect, or whenever the operator runs `startMqtt`. */
  pushConfig?: (device_id: string, payload: ConfigPayload) => void;
}

export function buildDeps(db: DB, env: NodeJS.ProcessEnv = process.env): Deps {
  const bus = new Bus();
  const makeable = new MakeableCache(db);
  makeable.recompute();
  const rawSamples = new RawSampleCache();
  return {
    db,
    bus,
    makeable,
    rawSamples,
    hmacSecret: env.HMAC_SECRET ?? null,
    guestMenu: {
      publicUrl: env.GUEST_PUBLIC_URL ?? null,
    },
  };
}
