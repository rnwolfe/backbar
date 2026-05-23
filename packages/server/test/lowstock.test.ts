import { describe, expect, test } from "bun:test";
import { isLowStock, lowStockThreshold, LOW_STOCK_FLOOR_ML, LOW_STOCK_FRACTION } from "../src/lowstock";

describe("low-stock threshold (spec §6)", () => {
  test("threshold = max(15% full, 60 ml floor) by default", () => {
    expect(lowStockThreshold({ full_ml: 750 })).toBeCloseTo(750 * LOW_STOCK_FRACTION);
    expect(lowStockThreshold({ full_ml: 200 })).toBe(LOW_STOCK_FLOOR_ML);
  });

  test("per-product override beats the global rule", () => {
    expect(lowStockThreshold({ full_ml: 750 }, 200)).toBe(200);
    expect(lowStockThreshold({ full_ml: 750 }, 0)).toBe(0);
  });

  test("isLowStock only applies to open/sealed bottles", () => {
    const empty = { full_ml: 750, level_ml: 5, status: "empty" as const };
    const open = { full_ml: 750, level_ml: 5, status: "open" as const };
    expect(isLowStock(empty)).toBe(false);
    expect(isLowStock(open)).toBe(true);
  });

  test("override = -1 falls back to the global rule (treats negative as unset)", () => {
    // Sanity: a sentinel override must not collapse the floor.
    expect(lowStockThreshold({ full_ml: 750 }, -1)).toBeCloseTo(750 * LOW_STOCK_FRACTION);
  });
});
