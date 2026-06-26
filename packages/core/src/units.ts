import type { Unit } from "./schema";

// `top` ≈ 60 ml splash to top a highball; `dash`/`barspoon` per spec §6.
// `oz`/`tsp`/`tbsp`/`cup` are US customary (printed-recipe + component-yield units).
// `drop` ≈ 0.05 ml; `pinch` is a tiny dry measure treated as ~0.3 ml of bulk.
// `each` and `leaf` are counted, not volumetric — they never deplete a bottle.
export const UNIT_ML: Record<Unit, number> = {
  ml: 1,
  oz: 29.5735,
  dash: 0.9,
  barspoon: 5,
  tsp: 4.92892,
  tbsp: 14.7868,
  cup: 236.588,
  drop: 0.05,
  pinch: 0.3,
  top: 60,
  each: 0,
  leaf: 0,
};

export const NON_DEPLETING: ReadonlySet<Unit> = new Set<Unit>(["each", "leaf"]);

export function isNonDepleting(unit: Unit | null | undefined): boolean {
  if (!unit) return false;
  return NON_DEPLETING.has(unit);
}

/**
 * Convert an amount in `unit` to millilitres of liquid drawn from a bottle.
 * Non-depleting units (each / leaf) always return 0 — they count, not pour.
 */
export function toMl(amount: number, unit: Unit | null | undefined): number {
  if (!unit) return amount;
  if (NON_DEPLETING.has(unit)) return 0;
  return amount * UNIT_ML[unit];
}

// Per spec §6 — category density defaults in g/ml. Override via product.density_g_ml.
export const DENSITY_BY_CATEGORY: Record<string, number> = {
  spirit: 0.95,
  "spirit-high": 0.93,
  vermouth: 1.0,
  wine: 1.0,
  amaro: 1.08,
  liqueur: 1.08,
  "syrup-simple": 1.22,
  "syrup-rich": 1.30,
  citrus: 1.03,
  juice: 1.04,
  bitters: 0.95,
  water: 1.0,
};

const DEFAULT_DENSITY = 0.96;
const HIGH_PROOF_THRESHOLD = 0.5;

/** Look up density for a product, honouring explicit overrides and a high-proof fork. */
export function density(p: {
  density_g_ml?: number | null;
  category: string;
  abv?: number | null;
}): number {
  if (p.density_g_ml != null && p.density_g_ml > 0) return p.density_g_ml;
  if (p.category === "spirit" && (p.abv ?? 0) >= HIGH_PROOF_THRESHOLD) {
    return DENSITY_BY_CATEGORY["spirit-high"]!;
  }
  return DENSITY_BY_CATEGORY[p.category] ?? DEFAULT_DENSITY;
}

/** Convert net grams (gross − tare) to millilitres at the given density. */
export function gramsToMl(netG: number, d: number): number {
  if (d <= 0) throw new Error(`density must be positive, got ${d}`);
  return netG / d;
}

/** Inverse for tests / synthetic readings. */
export function mlToGrams(ml: number, d: number): number {
  if (d <= 0) throw new Error(`density must be positive, got ${d}`);
  return ml * d;
}
