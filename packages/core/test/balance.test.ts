import { describe, expect, test } from "bun:test";
import {
  aggregateBalance,
  alcoholMl,
  balanceFlags,
  dilutionWaterMl,
  finalAbv,
  finalVolumeMl,
  METHOD_DILUTION,
  totalMl,
  type BalanceIngredient,
} from "../src/balance";

// Old Fashioned-ish: 60ml bourbon @ 50% + 5ml simple + 2 dashes bitters (~1.8ml @ 40%)
const oldFashioned: BalanceIngredient[] = [
  { amount_ml: 60, abv: 0.5, axes: { strong: 1, aromatic: 0.4 } },
  { amount_ml: 5, abv: 0, axes: { sweet: 1 } },
  { amount_ml: 1.8, abv: 0.4, axes: { bitter: 1, aromatic: 1 } },
];

describe("totals and alcohol", () => {
  test("totalMl sums amounts", () => {
    expect(totalMl(oldFashioned)).toBeCloseTo(66.8, 5);
  });

  test("alcoholMl weights by abv (undefined abv ignored)", () => {
    // 60*0.5 + 5*0 + 1.8*0.4 = 30 + 0 + 0.72 = 30.72
    expect(alcoholMl(oldFashioned)).toBeCloseTo(30.72, 5);
  });

  test("non-alcoholic mix has zero alcohol", () => {
    const mocktail: BalanceIngredient[] = [
      { amount_ml: 60, axes: { sour: 1 } },
      { amount_ml: 30, abv: 0, axes: { sweet: 1 } },
    ];
    expect(alcoholMl(mocktail)).toBe(0);
  });
});

describe("dilution by method", () => {
  test("build adds no water", () => {
    expect(dilutionWaterMl(oldFashioned, "build")).toBe(0);
  });

  test("stir adds ~22% by volume", () => {
    expect(dilutionWaterMl(oldFashioned, "stir")).toBeCloseTo(66.8 * 0.22, 5);
  });

  test("shake dilutes more than stir; blend the most", () => {
    expect(METHOD_DILUTION.shake).toBeGreaterThan(METHOD_DILUTION.stir);
    expect(METHOD_DILUTION.blend).toBeGreaterThan(METHOD_DILUTION.shake);
  });

  test("finalVolumeMl = base + water", () => {
    const base = totalMl(oldFashioned);
    expect(finalVolumeMl(oldFashioned, "stir")).toBeCloseTo(base * (1 + 0.22), 5);
  });
});

describe("finalAbv()", () => {
  test("empty drink returns 0", () => {
    expect(finalAbv([], "stir")).toBe(0);
  });

  test("Old Fashioned (stirred) lands in the 25-30% range", () => {
    const abv = finalAbv(oldFashioned, "stir");
    expect(abv).toBeGreaterThan(0.32); // 30.72/(66.8+14.696) ≈ 0.377
    expect(abv).toBeLessThan(0.40);
  });

  test("built (no dilution) is hotter than stirred", () => {
    const built = finalAbv(oldFashioned, "build");
    const stirred = finalAbv(oldFashioned, "stir");
    expect(built).toBeGreaterThan(stirred);
  });

  test("non-alcoholic drink stays at 0 regardless of method", () => {
    const mocktail: BalanceIngredient[] = [
      { amount_ml: 60 },
      { amount_ml: 30, abv: 0 },
    ];
    expect(finalAbv(mocktail, "shake")).toBe(0);
  });

  test("100% spirit shaken still respects dilution", () => {
    const neat: BalanceIngredient[] = [{ amount_ml: 60, abv: 1.0 }];
    const abv = finalAbv(neat, "shake");
    // 60 / (60 * 1.32) = 1 / 1.32 ≈ 0.7576
    expect(abv).toBeCloseTo(1 / 1.32, 4);
  });
});

describe("aggregateBalance()", () => {
  test("empty input returns all-zero with dilution from method", () => {
    const b = aggregateBalance([], "stir");
    expect(b.sweet).toBe(0);
    expect(b.sour).toBe(0);
    expect(b.bitter).toBe(0);
    expect(b.strong).toBe(0);
    expect(b.aromatic).toBe(0);
    expect(b.dilution).toBeCloseTo(0.22, 5);
  });

  test("axes are volume-weighted and clamped to 0..1", () => {
    const b = aggregateBalance(oldFashioned, "stir");
    // bourbon dominates (60/66.8 = ~0.898), so strong ≈ 0.898
    expect(b.strong).toBeGreaterThan(0.8);
    expect(b.strong).toBeLessThanOrEqual(1);
    // sweet: 5/66.8 ≈ 0.075
    expect(b.sweet).toBeCloseTo(5 / 66.8, 3);
    // dilution comes from method, not ingredients
    expect(b.dilution).toBeCloseTo(0.22, 5);
  });

  test("non-finite / out-of-range axis values are normalized", () => {
    const ings: BalanceIngredient[] = [
      { amount_ml: 30, axes: { sweet: 2 } },          // clamp to 1
      { amount_ml: 30, axes: { sweet: -1 } },         // clamp to 0
    ];
    const b = aggregateBalance(ings, "build");
    expect(b.sweet).toBeCloseTo(0.5, 5);              // (1*0.5 + 0*0.5)
    expect(b.dilution).toBe(0);
  });
});

describe("balanceFlags()", () => {
  test("too_hot when ABV > 0.30", () => {
    const builtOf = balanceFlags(oldFashioned, "build");   // ~0.46
    expect(builtOf.too_hot).toBe(true);
    expect(builtOf.too_watery).toBe(false);
  });

  test("too_watery when ABV < 0.08 with alcohol present", () => {
    // 10ml @ 40% + 200ml mixer = ~0.019 ABV
    const long: BalanceIngredient[] = [
      { amount_ml: 10, abv: 0.4 },
      { amount_ml: 200, abv: 0 },
    ];
    const f = balanceFlags(long, "build");
    expect(f.too_watery).toBe(true);
    expect(f.too_hot).toBe(false);
  });

  test("non-alcoholic mocktail never flagged too_watery", () => {
    const m: BalanceIngredient[] = [{ amount_ml: 250 }];
    expect(balanceFlags(m, "build").too_watery).toBe(false);
  });
});
