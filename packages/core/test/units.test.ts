import { describe, expect, test } from "bun:test";
import {
  DENSITY_BY_CATEGORY,
  density,
  gramsToMl,
  isNonDepleting,
  mlToGrams,
  NON_DEPLETING,
  toMl,
  UNIT_ML,
} from "../src/units";

describe("unit → ml conversion", () => {
  test("ml is identity", () => {
    expect(toMl(60, "ml")).toBe(60);
    expect(toMl(0.25, "ml")).toBe(0.25);
  });

  test("dash ≈ 0.9 ml", () => {
    expect(toMl(2, "dash")).toBeCloseTo(1.8, 5);
    expect(toMl(5, "dash")).toBeCloseTo(4.5, 5);
    expect(UNIT_ML.dash).toBe(0.9);
  });

  test("barspoon ≈ 5 ml", () => {
    expect(toMl(1, "barspoon")).toBe(5);
    expect(toMl(0.5, "barspoon")).toBe(2.5);
  });

  test("top ≈ 60 ml", () => {
    expect(toMl(1, "top")).toBe(60);
  });

  test("non-depleting units always return 0 ml", () => {
    expect(toMl(1, "each")).toBe(0);
    expect(toMl(12, "leaf")).toBe(0);
    expect(isNonDepleting("each")).toBe(true);
    expect(isNonDepleting("leaf")).toBe(true);
    expect(isNonDepleting("ml")).toBe(false);
    expect(isNonDepleting(null)).toBe(false);
    expect(isNonDepleting(undefined)).toBe(false);
    expect(NON_DEPLETING.has("each")).toBe(true);
  });

  test("null/undefined unit treats amount as raw number", () => {
    expect(toMl(42, null)).toBe(42);
    expect(toMl(42, undefined)).toBe(42);
  });
});

describe("density()", () => {
  test("uses explicit override when positive", () => {
    expect(density({ density_g_ml: 1.234, category: "spirit" })).toBe(1.234);
  });

  test("ignores null/zero override and falls back to category default", () => {
    expect(density({ density_g_ml: null, category: "vermouth" })).toBe(1.0);
    expect(density({ density_g_ml: 0, category: "spirit", abv: 0.4 })).toBe(0.95);
  });

  test("high-proof spirit fork at abv ≥ 0.5", () => {
    expect(density({ category: "spirit", abv: 0.4 })).toBe(0.95);
    expect(density({ category: "spirit", abv: 0.5 })).toBe(DENSITY_BY_CATEGORY["spirit-high"]!);
    expect(density({ category: "spirit", abv: 0.57 })).toBe(0.93);
  });

  test("known category densities (from §6)", () => {
    expect(density({ category: "syrup-simple" })).toBe(1.22);
    expect(density({ category: "syrup-rich" })).toBe(1.30);
    expect(density({ category: "citrus" })).toBe(1.03);
    expect(density({ category: "amaro" })).toBe(1.08);
    expect(density({ category: "liqueur" })).toBe(1.08);
    expect(density({ category: "wine" })).toBe(1.0);
  });

  test("unknown category falls back to ~spirit default", () => {
    expect(density({ category: "mystery-juice" })).toBeCloseTo(0.96, 5);
  });
});

describe("grams ↔ ml", () => {
  test("gramsToMl divides by density", () => {
    // 950 g of 40% spirit (d≈0.95) -> 1000 ml
    expect(gramsToMl(950, 0.95)).toBeCloseTo(1000, 5);
  });

  test("mlToGrams is the inverse", () => {
    const d = 0.95;
    const ml = 750;
    expect(gramsToMl(mlToGrams(ml, d), d)).toBeCloseTo(ml, 9);
  });

  test("zero or negative density throws", () => {
    expect(() => gramsToMl(100, 0)).toThrow();
    expect(() => gramsToMl(100, -1)).toThrow();
    expect(() => mlToGrams(100, 0)).toThrow();
  });
});
