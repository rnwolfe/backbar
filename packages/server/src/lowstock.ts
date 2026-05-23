import type { Bottle } from "@backbar/core";

/** Per spec §6: standard pour is 30 ml; threshold floor is 2 standard pours. */
export const STANDARD_POUR_ML = 30;
export const LOW_STOCK_FLOOR_ML = STANDARD_POUR_ML * 2; // 60 ml
export const LOW_STOCK_FRACTION = 0.15;

/**
 * Threshold below which a bottle counts as low stock.
 *
 * Per-product override (`low_threshold_ml`) wins when set; otherwise the
 * global rule `max(15% full, 60 ml)`. Returning a number — callers compare
 * `level_ml < threshold(...)`.
 */
export function lowStockThreshold(bottle: Pick<Bottle, "full_ml">, override?: number | null): number {
  if (typeof override === "number" && override >= 0) return override;
  return Math.max(bottle.full_ml * LOW_STOCK_FRACTION, LOW_STOCK_FLOOR_ML);
}

export function isLowStock(
  bottle: Pick<Bottle, "full_ml" | "level_ml" | "status">,
  override?: number | null,
): boolean {
  if (bottle.status !== "open" && bottle.status !== "sealed") return false;
  return bottle.level_ml < lowStockThreshold(bottle, override);
}
