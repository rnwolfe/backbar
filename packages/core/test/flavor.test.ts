import { describe, expect, test } from "bun:test";
import {
  type FlavorProfile,
  classifyFamily,
  flavorSimilarity,
  pairingBlend,
  ratioForFamily,
  acidToAdd,
  scoreFoodPairing,
  dominantTaste,
  profileToBalanceIngredient,
} from "../src/flavor";
import { aggregateBalance, finalAbv } from "../src/balance";

const gin: FlavorProfile = {
  ref: "gin",
  ref_type: "category",
  descriptors: ["juniper", "citrus", "pine", "coriander"],
  axes: { sweet: 0.05, sour: 0, bitter: 0.1, strong: 0.9, aromatic: 0.7 },
  typical_abv: 0.44,
  intensity: 0.8,
  role: "base-spirit",
};
const vodka: FlavorProfile = {
  ref: "vodka",
  ref_type: "category",
  descriptors: ["neutral", "clean"],
  axes: { sweet: 0, sour: 0, bitter: 0, strong: 0.9, aromatic: 0.05 },
  typical_abv: 0.4,
  intensity: 0.4,
  role: "base-spirit",
};
const lime: FlavorProfile = {
  ref: "lime",
  ref_type: "tag",
  descriptors: ["lime", "citrus", "tart"],
  axes: { sweet: 0.05, sour: 0.95, bitter: 0.05, strong: 0, aromatic: 0.2 },
  typical_abv: 0,
  intensity: 0.7,
  role: "citrus",
};
const simple: FlavorProfile = {
  ref: "simple-syrup",
  ref_type: "product",
  descriptors: ["sugar", "neutral-sweet"],
  axes: { sweet: 1, sour: 0, bitter: 0, strong: 0, aromatic: 0 },
  typical_abv: 0,
  intensity: 0.5,
  role: "syrup-sweet",
};

describe("flavorSimilarity", () => {
  test("gin is closer to gin than to vodka", () => {
    expect(flavorSimilarity(gin, gin)).toBeCloseTo(1, 5);
    expect(flavorSimilarity(gin, vodka)).toBeLessThan(flavorSimilarity(gin, gin));
  });
  test("citrus vs sweetener are dissimilar", () => {
    expect(flavorSimilarity(lime, simple)).toBeLessThan(0.4);
  });
});

describe("pairingBlend", () => {
  test("co-occurrence dominates and labels basis", () => {
    const r = pairingBlend({ cooccurrence: 0.9, descriptor: 0.2, molecular: 0.1 });
    expect(r.basis).toBe("both");
    expect(r.score).toBeGreaterThan(0.5);
  });
  test("molecular-only is labeled exploratory (molecular basis)", () => {
    expect(pairingBlend({ molecular: 0.8 }).basis).toBe("molecular");
  });
  test("descriptor-only when no co/molecular", () => {
    expect(pairingBlend({ descriptor: 0.5 }).basis).toBe("descriptor");
  });
  test("empty → zero", () => {
    expect(pairingBlend({}).score).toBe(0);
  });
});

describe("classifyFamily", () => {
  test("citrus + syrup shaken → daiquiri (sour)", () => {
    const v = classifyFamily(
      [{ role: "base-spirit" }, { role: "citrus" }, { role: "syrup-sweet" }],
      "shake",
    );
    expect(v.root).toBe("daiquiri");
    expect(v.family).toBe("sour");
  });
  test("citrus + liqueur → sidecar", () => {
    expect(
      classifyFamily([{ role: "base-spirit" }, { role: "citrus" }, { role: "liqueur-sweet" }]).root,
    ).toBe("sidecar");
  });
  test("spirit + aromatized wine, no citrus → martini", () => {
    expect(classifyFamily([{ role: "base-spirit" }, { role: "aromatized-wine" }], "stir").root).toBe(
      "martini",
    );
  });
  test("egg/dairy → flip", () => {
    expect(classifyFamily([{ role: "base-spirit" }, { role: "egg-dairy" }]).root).toBe("flip");
  });
  test("spirit + sugar + bitters, no citrus → old-fashioned", () => {
    expect(
      classifyFamily([{ role: "base-spirit" }, { role: "syrup-sweet" }, { role: "bitters" }]).root,
    ).toBe("old-fashioned");
  });
  test("amaro + aromatized wine → Negroni branch of martini", () => {
    expect(
      classifyFamily([{ role: "base-spirit" }, { role: "amaro-bitter" }, { role: "aromatized-wine" }])
        .family,
    ).toBe("spirit-forward");
  });
});

describe("ratioForFamily", () => {
  test("resolves by root and by family", () => {
    expect(ratioForFamily("daiquiri")?.ratio).toEqual([60, 22, 15]);
    expect(ratioForFamily("sour")?.root).toBe("daiquiri");
    expect(ratioForFamily("nonsense")).toBeNull();
  });
});

describe("acid math", () => {
  test("acidToAdd splits citric:malic 2:1", () => {
    const a = acidToAdd(1000, 0.8, 6); // OJ-like → lime-like
    expect(a.total_g).toBeGreaterThan(50);
    expect(a.citric_g).toBeCloseTo(a.malic_g * 2, 1);
  });
});

describe("scoreFoodPairing", () => {
  test("sour drink + fatty dish scores well (acid cuts fat)", () => {
    const drink = { intensity: 0.6, taste: "sour" as const, descriptors: ["lime"], baseSpirit: "tequila" };
    const fatty = scoreFoodPairing({ intensity: 0.6, tastes: { fat: 0.9 }, cuisine: "mexican" }, drink);
    const clashing = scoreFoodPairing({ intensity: 0.6, tastes: { umami: 0.9 } }, {
      ...drink,
      taste: "bitter" as const,
    });
    expect(fatty.score).toBeGreaterThan(clashing.score);
    expect(fatty.dimensions.cuisine).toBeGreaterThan(0.5);
  });
  test("intensity mismatch is penalized", () => {
    const drink = { intensity: 0.1, taste: "sweet" as const, descriptors: [] };
    const s = scoreFoodPairing({ intensity: 0.95, tastes: { spicy: 0.5 } }, drink);
    expect(s.dimensions.intensity).toBeLessThan(0.3);
  });
});

describe("dominantTaste", () => {
  test("picks the strongest of sour/sweet/bitter", () => {
    expect(dominantTaste(lime.axes)).toBe("sour");
    expect(dominantTaste(simple.axes)).toBe("sweet");
  });
});

describe("profileToBalanceIngredient integrates with balance.ts", () => {
  test("a daiquiri build computes a sane final ABV", () => {
    const ings = [
      profileToBalanceIngredient(
        { axes: { sweet: 0.05, sour: 0, bitter: 0, strong: 0.9, aromatic: 0.2 }, typical_abv: 0.4 },
        60,
      ),
      profileToBalanceIngredient(lime, 22),
      profileToBalanceIngredient(simple, 15),
    ];
    const abv = finalAbv(ings, "shake");
    expect(abv).toBeGreaterThan(0.15);
    expect(abv).toBeLessThan(0.28);
    const bal = aggregateBalance(ings, "shake");
    expect(bal.sour).toBeGreaterThan(0.1);
    expect(bal.dilution).toBeGreaterThan(0.2);
  });
});
