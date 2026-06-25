/**
 * /settings — generic operator key/value settings.
 *
 * Like /flags, the set of known keys is a server-side registry (label +
 * description + validation); the DB only stores values an operator has set.
 * Booleans belong in /flags; this is for everything else (e.g. the VA ABC home
 * store number). Unknown keys are rejected so the surface stays auditable.
 *
 *   GET  /settings        → { [key]: value } (only keys with a stored value)
 *   GET  /settings/registry → known keys + metadata (for rendering the UI)
 *   PUT  /settings/:key   → { value: string | number | null }  (null clears it)
 */
import { Hono } from "hono";
import { z } from "zod";
import { appSettings as appSettingsRepo } from "@backbar/db";
import { VA_ABC_HOME_STORE_KEY, type Deps } from "../deps";
import { err, parseBody } from "../errors";

export interface SettingDef {
  key: string;
  label: string;
  description?: string;
  /** Validation/coercion hint. Currently just integers; extend as needed. */
  kind: "int";
  min?: number;
  max?: number;
}

/** Known settings. Add new ones here; the UI surfaces them via /settings/registry. */
export const SETTINGS_REGISTRY: readonly SettingDef[] = [
  {
    key: VA_ABC_HOME_STORE_KEY,
    label: "VA ABC home store",
    description:
      "Your nearest Virginia ABC store number — the anchor for local-stock lookups. Find it via the ABC store locator (\"ABC Store 088\" → 88). Pairs with the 'VA ABC local stock' feature flag.",
    kind: "int",
    min: 1,
  },
];

const PutBody = z.object({ value: z.union([z.string(), z.number(), z.null()]) });

/** Validate + normalize a value to its stored string form, or null to clear. */
function normalize(def: SettingDef, value: string | number | null): { value: string | null } | { error: string } {
  if (value === null || (typeof value === "string" && value.trim() === "")) {
    return { value: null };
  }
  if (def.kind === "int") {
    const n = typeof value === "number" ? value : Number.parseInt(value.trim(), 10);
    if (!Number.isInteger(n)) return { error: `'${def.key}' must be an integer` };
    if (def.min != null && n < def.min) return { error: `'${def.key}' must be ≥ ${def.min}` };
    if (def.max != null && n > def.max) return { error: `'${def.key}' must be ≤ ${def.max}` };
    return { value: String(n) };
  }
  return { error: `unsupported setting kind for '${def.key}'` };
}

export function settingsRouter(deps: Deps) {
  const r = new Hono();

  r.get("/", (c) => c.json(appSettingsRepo(deps.db).all()));

  r.get("/registry", (c) => c.json(SETTINGS_REGISTRY));

  r.put("/:key", async (c) => {
    const key = c.req.param("key");
    const def = SETTINGS_REGISTRY.find((s) => s.key === key);
    if (!def) return err(c, 404, "not-found", `unknown setting '${key}'`);

    const parsed = await parseBody(c, PutBody);
    if (parsed.error) return parsed.response;

    const norm = normalize(def, parsed.data.value);
    if ("error" in norm) return err(c, 400, "validation", norm.error);

    if (norm.value === null) {
      appSettingsRepo(deps.db).delete(key);
      return c.json({ key, value: null });
    }
    const saved = appSettingsRepo(deps.db).set(key, norm.value);
    return c.json(saved);
  });

  return r;
}
