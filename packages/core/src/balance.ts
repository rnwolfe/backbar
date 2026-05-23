import type { Balance, Method } from "./schema";

/**
 * Liquid-Intelligence-style dilution factors per method.
 * Roughly the ml of water added per ml of pre-dilution drink during
 * chilling. Calibrated for cubed ice; crushed/blend run higher.
 */
export const METHOD_DILUTION: Record<Method, number> = {
  build: 0,
  stir: 0.22,
  shake: 0.32,
  swizzle: 0.15,
  blend: 0.5,
  throw: 0.15,
};

export interface BalanceIngredient {
  /** Volume drawn into the drink, in millilitres (pre-dilution). */
  amount_ml: number;
  /** Optional ABV of this ingredient, 0..1. Defaults to 0 (non-alcoholic). */
  abv?: number;
  /**
   * Optional balance contribution on each axis 0..1. Volume-weighted when
   * aggregated. Axes not provided are treated as 0 contribution from this line.
   */
  axes?: Partial<Balance>;
}

/** Total liquid volume across ingredients, pre-dilution. */
export function totalMl(ingredients: BalanceIngredient[]): number {
  return ingredients.reduce((sum, i) => sum + i.amount_ml, 0);
}

/** Millilitres of pure alcohol contributed by the ingredients. */
export function alcoholMl(ingredients: BalanceIngredient[]): number {
  return ingredients.reduce((sum, i) => sum + i.amount_ml * (i.abv ?? 0), 0);
}

/** Millilitres of water added by chilling for the given method. */
export function dilutionWaterMl(ingredients: BalanceIngredient[], method: Method): number {
  const factor = METHOD_DILUTION[method] ?? 0;
  return totalMl(ingredients) * factor;
}

/**
 * Final ABV after method-driven dilution.
 * `alcohol_ml / (total_ml + water_ml)`. Returns 0 for empty input.
 */
export function finalAbv(ingredients: BalanceIngredient[], method: Method): number {
  const base = totalMl(ingredients);
  if (base === 0) return 0;
  const alc = alcoholMl(ingredients);
  const water = dilutionWaterMl(ingredients, method);
  return alc / (base + water);
}

/** Volume of the served drink including chilling dilution. */
export function finalVolumeMl(ingredients: BalanceIngredient[], method: Method): number {
  return totalMl(ingredients) + dilutionWaterMl(ingredients, method);
}

const AXES = ["sweet", "sour", "bitter", "strong", "aromatic", "dilution"] as const;
type Axis = (typeof AXES)[number];

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Volume-weighted aggregate of per-ingredient balance contributions.
 * `dilution` is overlaid from method-driven dilution_factor (capped at 1).
 * Returns canonical 0..1 axes; non-finite inputs are treated as 0.
 */
export function aggregateBalance(
  ingredients: BalanceIngredient[],
  method: Method,
): Balance {
  const total = totalMl(ingredients);
  const out: Record<Axis, number> = {
    sweet: 0,
    sour: 0,
    bitter: 0,
    strong: 0,
    aromatic: 0,
    dilution: 0,
  };

  if (total > 0) {
    for (const ing of ingredients) {
      const w = ing.amount_ml / total;
      for (const ax of AXES) {
        const v = ing.axes?.[ax];
        if (typeof v === "number" && Number.isFinite(v)) {
          out[ax] += clamp01(v) * w;
        }
      }
    }
  }

  // Override the dilution axis with method-driven dilution_factor (clamped).
  out.dilution = clamp01(METHOD_DILUTION[method] ?? 0);

  for (const ax of AXES) out[ax] = clamp01(out[ax]);
  return out;
}

/** Heuristic flags for QA — too hot (high abv) / too watery (low abv) etc. */
export interface BalanceFlags {
  too_hot: boolean;        // final ABV > 0.30
  too_watery: boolean;     // final ABV < 0.08 and at least one alcoholic ingredient
}

export function balanceFlags(
  ingredients: BalanceIngredient[],
  method: Method,
): BalanceFlags {
  const abv = finalAbv(ingredients, method);
  const hasBooze = ingredients.some((i) => (i.abv ?? 0) > 0);
  return {
    too_hot: abv > 0.30,
    too_watery: hasBooze && abv < 0.08,
  };
}
