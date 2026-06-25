/**
 * /flags — operator-toggleable feature flags.
 *
 * The set of known flags is defined here in the FLAG_REGISTRY: a runtime
 * registration of (key, label, description, default). The DB only stores
 * overrides — missing rows fall back to the registry default, which means
 * adding a flag in code requires no migration / backfill.
 *
 * Toggle path: PATCH /flags/:key {enabled: bool} → upsert override → emit
 * `flag.changed` on the bus → WS broadcast → operator UI updates without
 * a page reload.
 */
import { Hono } from "hono";
import { z } from "zod";
import { featureFlags as flagsRepo } from "@backbar/db";
import type { Deps } from "../deps";
import { err, parseBody } from "../errors";

export interface FlagDef {
  key: string;
  label: string;
  description?: string;
  default: boolean;
}

/**
 * Known flags. Add new ones here; UI surfaces them automatically.
 *
 * Naming: lowercase, dot-separated. `feature.` prefix is conventional but
 * not required — keep it short and obvious.
 */
export const FLAG_REGISTRY: readonly FlagDef[] = [
  {
    key: "shelf",
    label: "Smart shelf",
    description:
      "Show the Shelf screen + Calibrate channel command. Turn off until load-cell hardware is wired up — manual volume entry and pour subtraction still work without it.",
    default: false,
  },
  {
    key: "va-abc",
    label: "VA ABC local stock",
    description:
      "Show nearest Virginia ABC store + price for a product/bottle (catalog & bottle detail). Needs VA_ABC_HOME_STORE set to your nearest store number. Uses undocumented endpoints — degrades silently to no data.",
    default: false,
  },
];

export interface PublicFlag {
  key: string;
  label: string;
  description: string | null;
  default_enabled: boolean;
  enabled: boolean;
  /** ms epoch of the last override toggle, null when the row is registry-default. */
  updated_at: number | null;
}

/**
 * Project the registry + DB overrides into the shape consumed by clients.
 * Pure — exported for tests + the WS bootstrap.
 */
export function projectFlags(
  registry: readonly FlagDef[],
  overrides: { key: string; enabled: boolean; updated_at: number }[],
): PublicFlag[] {
  const byKey = new Map(overrides.map((o) => [o.key, o] as const));
  return registry.map((def) => {
    const o = byKey.get(def.key);
    return {
      key: def.key,
      label: def.label,
      description: def.description ?? null,
      default_enabled: def.default,
      enabled: o ? o.enabled : def.default,
      updated_at: o?.updated_at ?? null,
    };
  });
}

/**
 * Resolve a flag's effective value (default + override). Server-side
 * consumers can call this from anywhere with access to `deps.db`.
 */
export function flagEnabled(deps: Deps, key: string): boolean {
  const def = FLAG_REGISTRY.find((f) => f.key === key);
  if (!def) return false;
  const override = flagsRepo(deps.db).getOverride(key);
  return override ? override.enabled : def.default;
}

const PatchBody = z.object({ enabled: z.boolean() });

export function flagsRouter(deps: Deps) {
  const r = new Hono();

  r.get("/", (c) => {
    return c.json(projectFlags(FLAG_REGISTRY, flagsRepo(deps.db).listOverrides()));
  });

  r.patch("/:key", async (c) => {
    const key = c.req.param("key");
    const def = FLAG_REGISTRY.find((f) => f.key === key);
    if (!def) return err(c, 404, "not-found", `unknown flag '${key}'`);
    const parsed = await parseBody(c, PatchBody);
    if (parsed.error) return parsed.response;

    flagsRepo(deps.db).setOverride(key, parsed.data.enabled);
    deps.bus.emit({ type: "flag.changed", key, enabled: parsed.data.enabled });

    return c.json(projectFlags(FLAG_REGISTRY, flagsRepo(deps.db).listOverrides()).find((f) => f.key === key));
  });

  return r;
}
