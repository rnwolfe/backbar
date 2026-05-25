/**
 * 28-day pour + reading history generator.
 *
 * Strategy: pick a set of "default makeables" we know the starter bar can
 * actually pour (Old Fashioned, Negroni, Manhattan, Daiquiri, Margarita,
 * Whiskey Sour, Jungle Bird, Mai Tai, Sazerac, Gimlet, Martini). For each
 * day in the last 28, pick N pours (weekend-heavy + sin-wave), assign each
 * pour a recipe + made_at timestamp, and emit a `Pour` row whose bindings
 * point at the bottles we've reserved for that recipe.
 *
 * We don't replay these through `depletePour()` — running 28 days of real
 * depletion would empty the bar before the operator sees it. Instead, the
 * generator emits "ghost" pour rows: `bottles_used` records what *would*
 * have come from each bottle, but we don't touch `bottle.level_ml`. The
 * Pours screen aggregates over `pour.bottles_used` so the analytics still
 * read true; the live bottle levels remain at whatever the static seed set.
 *
 * Each pour also emits one synthetic `reading{source:'pour'}` per touched
 * bottle so the bottle-detail sparkline has data. Levels in those readings
 * walk *down* from `full_ml` toward `level_ml` linearly over 28 days so the
 * sparkline shows a believable depletion curve. Trigger `reading_no_update`
 * is fine — we only INSERT.
 */
import type { Pour, Reading } from "@backbar/core";

export interface SyntheticPourEvent {
  recipe_id: string;
  bindings: { bottle_id: string; ml: number }[];
  made_at: number;
}

/** Map a recipe id → bottle bindings against the starter bar. */
export interface RecipeBottleMap {
  recipe_id: string;
  bindings: { bottle_id: string; ml: number }[];
}

/**
 * Hand-curated bindings — uses starter bottle ids only (so the seed survives
 * a bar reset + reseed cycle). When the canon recipe doesn't have a starter
 * equivalent, it's omitted from the rotation.
 */
export const RECIPE_BINDINGS: RecipeBottleMap[] = [
  {
    recipe_id: "old-fashioned",
    bindings: [
      { bottle_id: "bottle-buffalo-trace", ml: 60 },
      { bottle_id: "bottle-simple-syrup", ml: 5 },
      { bottle_id: "bottle-angostura-bitters", ml: 1.8 },
    ],
  },
  {
    recipe_id: "negroni",
    bindings: [
      { bottle_id: "bottle-tanqueray", ml: 30 },
      { bottle_id: "bottle-campari", ml: 30 },
      { bottle_id: "bottle-carpano-antica", ml: 30 },
    ],
  },
  {
    recipe_id: "manhattan",
    bindings: [
      { bottle_id: "bottle-rittenhouse-rye", ml: 60 },
      { bottle_id: "bottle-carpano-antica", ml: 30 },
      { bottle_id: "bottle-angostura-bitters", ml: 1.8 },
    ],
  },
  {
    recipe_id: "daiquiri",
    bindings: [
      { bottle_id: "bottle-bacardi-superior", ml: 60 },
      { bottle_id: "bottle-lime-juice", ml: 22 },
      { bottle_id: "bottle-simple-syrup", ml: 15 },
    ],
  },
  {
    recipe_id: "margarita",
    bindings: [
      { bottle_id: "bottle-espolon-blanco", ml: 50 },
      { bottle_id: "bottle-orange-curacao", ml: 22 },
      { bottle_id: "bottle-lime-juice", ml: 22 },
    ],
  },
  {
    recipe_id: "whiskey-sour",
    bindings: [
      { bottle_id: "bottle-buffalo-trace", ml: 60 },
      { bottle_id: "bottle-lemon-juice", ml: 22 },
      { bottle_id: "bottle-simple-syrup", ml: 15 },
    ],
  },
  {
    recipe_id: "jungle-bird",
    bindings: [
      { bottle_id: "bottle-cruzan-blackstrap", ml: 45 },
      { bottle_id: "bottle-campari", ml: 22 },
      { bottle_id: "bottle-pineapple-juice", ml: 45 },
      { bottle_id: "bottle-lime-juice", ml: 15 },
      { bottle_id: "bottle-simple-syrup", ml: 15 },
    ],
  },
  {
    recipe_id: "mai-tai",
    bindings: [
      { bottle_id: "bottle-appleton-estate-reserve", ml: 30 },
      { bottle_id: "bottle-smith-and-cross", ml: 30 },
      { bottle_id: "bottle-orange-curacao", ml: 15 },
      { bottle_id: "bottle-orgeat", ml: 15 },
      { bottle_id: "bottle-lime-juice", ml: 22 },
    ],
  },
  {
    recipe_id: "sazerac",
    bindings: [
      { bottle_id: "bottle-rittenhouse-rye", ml: 60 },
      { bottle_id: "bottle-simple-syrup", ml: 5 },
      { bottle_id: "bottle-peychauds-bitters", ml: 3 },
      { bottle_id: "bottle-absinthe", ml: 2 },
    ],
  },
  {
    recipe_id: "gimlet",
    bindings: [
      { bottle_id: "bottle-tanqueray", ml: 60 },
      { bottle_id: "bottle-lime-juice", ml: 22 },
      { bottle_id: "bottle-simple-syrup", ml: 15 },
    ],
  },
  {
    recipe_id: "martini",
    bindings: [
      { bottle_id: "bottle-tanqueray", ml: 75 },
      { bottle_id: "bottle-dolin-dry", ml: 15 },
    ],
  },
];

/**
 * Generate a deterministic 28-day pour stream. Daily count follows the same
 * curve the UI used for synth: weekend-heavy (1.6×) on Fri/Sat, baseline
 * 0.7×, plus a sin wave for organic variation. Within a day, pours spread
 * across evening service hours (16:00–22:00).
 */
export function generatePourHistory(now: number = Date.now(), days = 28): SyntheticPourEvent[] {
  const out: SyntheticPourEvent[] = [];
  const dayMs = 86_400_000;
  for (let d = days - 1; d >= 0; d--) {
    const dayStart = startOfDay(now - d * dayMs);
    const dow = new Date(dayStart).getDay();
    const weekendWeight = dow === 5 || dow === 6 ? 1.6 : 0.7;
    const pourCount = Math.max(1, Math.round(2 + 6 * weekendWeight + (Math.sin(d * 1.3) + 1) * 2));
    for (let i = 0; i < pourCount; i++) {
      // Service window 16:00–22:00 (21,600,000ms span). Clamp to `now - 60s`
      // so today's seeded pours never land in the future (which would make
      // /telemetry's last_pour_age_s go negative).
      const hourOffset = 16 * 3600 * 1000;
      const span = 6 * 3600 * 1000;
      const raw = dayStart + hourOffset + Math.floor((i / pourCount) * span) + ((i * 7919 + d * 31) % 1_800_000);
      const ts = Math.min(raw, now - 60_000);
      const binding = RECIPE_BINDINGS[(d * 13 + i * 7) % RECIPE_BINDINGS.length]!;
      out.push({ recipe_id: binding.recipe_id, bindings: binding.bindings, made_at: ts });
    }
  }
  return out;
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * For each bottle, walk a 14-step depletion curve from full_ml down to its
 * current level_ml — emits `reading{source:'weight'}` events so the bottle
 * detail sparkline reads off real data. Spread across the last 14 days.
 */
export function generateLevelHistory(
  bottles: { id: string; full_ml: number; level_ml: number }[],
  uuidv7: () => string,
  now: number = Date.now(),
  steps = 14,
): Reading[] {
  const out: Reading[] = [];
  const dayMs = 86_400_000;
  for (const b of bottles) {
    const drop = b.full_ml - b.level_ml;
    for (let i = 0; i < steps; i++) {
      const frac = i / (steps - 1 || 1);
      const noise = (((b.id.charCodeAt(1) || 0) * (i + 1)) % 17) / 100;
      const level = Math.max(0, b.full_ml - drop * frac + noise * 4);
      const ts = now - (steps - 1 - i) * dayMs - ((b.id.length * 7) % 3600) * 1000;
      out.push({
        id: uuidv7(),
        bottle_id: b.id,
        level_ml: Math.round(level),
        source: i === steps - 1 ? "manual" : "weight",
        confidence: 1,
        raw: null,
        ts,
      });
    }
  }
  return out;
}

/** Convert a pour event to the `Pour` row shape. */
export function asPourRow(ev: SyntheticPourEvent, uuidv7: () => string): Pour {
  return {
    id: uuidv7(),
    recipe_id: ev.recipe_id,
    made_at: ev.made_at,
    bottles_used: ev.bindings,
  };
}
