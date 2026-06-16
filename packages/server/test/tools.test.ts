import { beforeEach, describe, expect, test } from "bun:test";
import { seedFlavor } from "@backbar/db";
import { buildTools } from "../src/ai/tools";
import { setup } from "./_helpers";

// Build a tool registry over a seeded test DB (setup() runs all migrations incl.
// the flavor tables; seedFlavor loads the corpus + derives co-occurrence).
function tools() {
  const { deps } = setup();
  seedFlavor(deps.db);
  return buildTools(deps);
}

// AI-SDK tool().execute takes (input, options); tests stub options.
const call = (t: { execute?: (i: unknown, o: unknown) => unknown }, input: unknown) =>
  (t.execute as (i: unknown, o: unknown) => Promise<unknown>)(input, {});

const SP = "shake";

describe("flavor_profile", () => {
  test("resolves a category and a product", async () => {
    const t = tools();
    expect((await call(t.flavor_profile, { ref: "gin" })) as { found: boolean }).toMatchObject({
      found: true,
      role: "base-spirit",
    });
    expect((await call(t.flavor_profile, { ref: "campari" })) as { role: string }).toMatchObject({
      role: "amaro-bitter",
    });
  });
  test("unknown ref → not found", async () => {
    const t = tools();
    expect((await call(t.flavor_profile, { ref: "moon-juice" })) as { found: boolean }).toMatchObject({
      found: false,
    });
  });
});

describe("check_balance", () => {
  test("a daiquiri-shaped build is balanced", async () => {
    const t = tools();
    const r = (await call(t.check_balance, {
      method: SP,
      ingredients: [
        { ref: "white-rum", amount: 60, unit: "ml" },
        { ref: "lime", amount: 22, unit: "ml" },
        { ref: "simple-syrup", amount: 15, unit: "ml" },
      ],
    })) as { verdict: string; final_abv: number; ratio_readout: string };
    expect(r.verdict).toBe("ok");
    expect(r.final_abv).toBeGreaterThan(0.15);
    expect(r.final_abv).toBeLessThan(0.28);
    expect(r.ratio_readout).toContain(":");
  });

  test("an all-spirit build flagged too hot → revise", async () => {
    const t = tools();
    const r = (await call(t.check_balance, {
      method: "stir",
      ingredients: [
        { ref: "gin", amount: 60, unit: "ml" },
        { ref: "rye", amount: 30, unit: "ml" },
      ],
    })) as { verdict: string; flags: { too_hot: boolean }; issues: string[] };
    expect(r.flags.too_hot).toBe(true);
    expect(r.verdict).toBe("revise");
    expect(r.issues.join(" ")).toContain("too hot");
  });
});

describe("classify_family", () => {
  test("citrus + syrup shaken → daiquiri, matches claim", async () => {
    const t = tools();
    const r = (await call(t.classify_family, {
      method: SP,
      claimed_family: "sour",
      ingredients: [
        { ref: "white-rum", amount: 60, unit: "ml" },
        { ref: "lime", amount: 22, unit: "ml" },
        { ref: "simple-syrup", amount: 15, unit: "ml" },
      ],
    })) as { root: string; matches: boolean };
    expect(r.root).toBe("daiquiri");
    expect(r.matches).toBe(true);
  });
});

describe("suggest_ratio / shake_or_stir / compute_dilution", () => {
  test("suggest_ratio resolves a family", async () => {
    const t = tools();
    expect((await call(t.suggest_ratio, { family: "sour" })) as { root: string }).toMatchObject({
      root: "daiquiri",
    });
  });
  test("shake_or_stir picks shake for citrus", async () => {
    const t = tools();
    expect(
      (await call(t.shake_or_stir, { ingredients: [{ ref: "gin", amount: 60, unit: "ml" }, { ref: "lime", amount: 20, unit: "ml" }] })) as {
        method: string;
      },
    ).toMatchObject({ method: "shake" });
  });
  test("compute_dilution returns water + final volume", async () => {
    const t = tools();
    const r = (await call(t.compute_dilution, {
      method: "stir",
      ingredients: [{ ref: "gin", amount: 60, unit: "ml" }, { ref: "sweet-vermouth", amount: 30, unit: "ml" }],
    })) as { water_ml: number; final_volume_ml: number };
    expect(r.water_ml).toBeGreaterThan(0);
    expect(r.final_volume_ml).toBeGreaterThan(90);
  });
});

describe("pairing tools", () => {
  test("pairing_score is high for ingredients that co-occur in canon", async () => {
    const t = tools();
    const r = (await call(t.pairing_score, { a: "gin", b: "campari" })) as {
      score: number;
      basis: string;
    };
    expect(r.score).toBeGreaterThan(0.3);
  });
  test("top_pairings returns ranked partners", async () => {
    const t = tools();
    const r = (await call(t.top_pairings, { ref: "campari", n: 3 })) as { partners: unknown[] };
    expect(r.partners.length).toBeGreaterThan(0);
  });
  test("flavor_similar surfaces the curated rye→bourbon swap", async () => {
    const t = tools();
    const r = (await call(t.flavor_similar, { ref: "rye" })) as { alternatives: { ref: string }[] };
    expect(r.alternatives.map((a) => a.ref)).toContain("bourbon");
  });
});

describe("check_makeable", () => {
  test("in-stock refs pass; unknown is missing; freeform is ok", async () => {
    const t = tools();
    // setup() stocks rum/lime/simple.
    expect((await call(t.check_makeable, { refs: ["rum", "egg-white"] })) as { makeable: boolean }).toMatchObject({
      makeable: true,
    });
    const miss = (await call(t.check_makeable, { refs: ["unobtainium"] })) as { makeable: boolean; missing: string[] };
    expect(miss.makeable).toBe(false);
    expect(miss.missing).toContain("unobtainium");
  });
});

describe("score_food_pairing", () => {
  test("a tart tequila drink pairs with a fatty mexican dish", async () => {
    const t = tools();
    const r = (await call(t.score_food_pairing, {
      dish: { intensity: 0.6, tastes: { fat: 0.9 }, cuisine: "mexican" },
      cocktail: {
        method: SP,
        ingredients: [
          { ref: "blanco-tequila", amount: 60, unit: "ml" },
          { ref: "lime", amount: 22, unit: "ml" },
          { ref: "simple-syrup", amount: 15, unit: "ml" },
        ],
      },
    })) as { score: number; dimensions: { cuisine: number } };
    expect(r.score).toBeGreaterThan(0.4);
    expect(r.dimensions.cuisine).toBeGreaterThan(0.5);
  });
});
