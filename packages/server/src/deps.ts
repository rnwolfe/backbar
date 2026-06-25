import type { DB } from "@backbar/db";
import { appSettings } from "@backbar/db";
import { Bus } from "./bus";
import { createVaAbcSource, type ProcurementSource } from "./integrations/va-abc";
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
  /** VA ABC local-stock source. Null unless VA_ABC_HOME_STORE is configured;
   *  the `/products/:id/local` route also gates on the `va-abc` feature flag.
   *  Degrades to null results internally, so a non-null source still means
   *  "no local data" is a normal, non-error outcome. */
  procurement: ProcurementSource | null;
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
    procurement: buildProcurement(db, env),
  };
}

/**
 * Build the VA ABC procurement source. The home store is an operator *setting*
 * (`va_abc.home_store`, set from Settings → not an env var), read live per
 * lookup so it takes effect without a restart — hence the source is always
 * built. When the store is unset, `lookup()` resolves to null with no network.
 * The route additionally gates on the `va-abc` feature flag.
 */
function buildProcurement(db: DB, env: NodeJS.ProcessEnv): ProcurementSource {
  return createVaAbcSource({
    resolveHomeStore: () => appSettings(db).getNumber(VA_ABC_HOME_STORE_KEY),
    ...(env.VA_ABC_BASE_URL ? { baseURL: env.VA_ABC_BASE_URL } : {}),
  });
}

/** Setting key for the operator's nearest VA ABC store number. */
export const VA_ABC_HOME_STORE_KEY = "va_abc.home_store";
