import { describe, expect, test } from "bun:test";
import { coverage, evaluate, type InvBottle } from "../src/makeability";
import { Recipe } from "../src/schema";

const product = (over: Partial<InvBottle["product"]> & { id: string }) => ({
  id: over.id,
  name: over.name ?? over.id,
  category: over.category ?? "spirit",
  subcategory: over.subcategory ?? null,
  abv: over.abv ?? 0.4,
  density_g_ml: over.density_g_ml ?? null,
  default_ml: over.default_ml ?? 750,
  flavor_tags: over.flavor_tags ?? [],
  notes: over.notes ?? null,
});

const bottle = (over: Partial<InvBottle> & { id: string; product_id: string }): InvBottle => ({
  id: over.id,
  product_id: over.product_id,
  slot: over.slot ?? null,
  tare_g: over.tare_g ?? null,
  full_ml: over.full_ml ?? 750,
  level_ml: over.level_ml ?? 750,
  status: over.status ?? "open",
  tracked: over.tracked ?? false,
  opened_at: over.opened_at ?? null,
  purchased_at: over.purchased_at ?? null,
  price_cents: over.price_cents ?? null,
  product: over.product ?? product({ id: over.product_id }),
});

const negroni = Recipe.parse({
  id: "negroni",
  name: "Negroni",
  family: "stirred",
  method: "stir",
  ingredients: [
    { ref_type: "category", ref_id: "gin", amount: 30, unit: "ml" },
    { ref_type: "category", ref_id: "vermouth", amount: 30, unit: "ml" },
    { ref_type: "category", ref_id: "amaro", amount: 30, unit: "ml" },
    // garnish doesn't block
    { ref_type: "freeform", ref_id: "orange-peel", garnish: true },
  ],
});

const mojito = Recipe.parse({
  id: "mojito",
  name: "Mojito",
  ingredients: [
    { ref_type: "category", ref_id: "rum", amount: 60, unit: "ml" },
    { ref_type: "category", ref_id: "citrus", amount: 22, unit: "ml" },
    { ref_type: "category", ref_id: "syrup-simple", amount: 15, unit: "ml" },
    { ref_type: "freeform", ref_id: "mint", amount: 8, unit: "leaf" },
    { ref_type: "freeform", ref_id: "soda", amount: 1, unit: "top" },
  ],
});

describe("evaluate() — ref_type resolution", () => {
  test("product ref_type", () => {
    const recipe = Recipe.parse({
      id: "beefeater-martini",
      name: "Beefeater Martini",
      ingredients: [
        { ref_type: "product", ref_id: "beefeater", amount: 60, unit: "ml" },
      ],
    });
    const inv = [bottle({ id: "b1", product_id: "beefeater" })];
    expect(evaluate(recipe, inv).state).toBe("makeable");
  });

  test("category ref_type", () => {
    const inv = [
      bottle({
        id: "b1",
        product_id: "beefeater",
        product: product({ id: "beefeater", category: "gin" }),
      }),
      bottle({
        id: "b2",
        product_id: "carpano",
        product: product({ id: "carpano", category: "vermouth" }),
      }),
      bottle({
        id: "b3",
        product_id: "campari",
        product: product({ id: "campari", category: "amaro" }),
      }),
    ];
    expect(evaluate(negroni, inv).state).toBe("makeable");
  });

  test("tag ref_type", () => {
    const recipe = Recipe.parse({
      id: "junipery",
      name: "Junipery",
      ingredients: [
        { ref_type: "tag", ref_id: "juniper", amount: 60, unit: "ml" },
      ],
    });
    const inv = [
      bottle({
        id: "b1",
        product_id: "tanq",
        product: product({ id: "tanq", category: "gin", flavor_tags: ["juniper", "citrus"] }),
      }),
    ];
    expect(evaluate(recipe, inv).state).toBe("makeable");
  });
});

describe("evaluate() — state transitions", () => {
  test("makeable: all required ingredients satisfied", () => {
    const inv = [
      bottle({ id: "b1", product_id: "beefeater", product: product({ id: "beefeater", category: "gin" }) }),
      bottle({ id: "b2", product_id: "carpano", product: product({ id: "carpano", category: "vermouth" }) }),
      bottle({ id: "b3", product_id: "campari", product: product({ id: "campari", category: "amaro" }) }),
    ];
    const r = evaluate(negroni, inv);
    expect(r.state).toBe("makeable");
    expect(r.missing).toEqual([]);
    expect(r.bindings).toHaveLength(3);
  });

  test("one-away: exactly one missing ingredient", () => {
    const inv = [
      bottle({ id: "b1", product_id: "beefeater", product: product({ id: "beefeater", category: "gin" }) }),
      bottle({ id: "b2", product_id: "carpano", product: product({ id: "carpano", category: "vermouth" }) }),
    ];
    const r = evaluate(negroni, inv);
    expect(r.state).toBe("one-away");
    expect(r.missing).toHaveLength(1);
  });

  test("unmakeable: ≥2 missing ingredients", () => {
    const inv = [
      bottle({ id: "b1", product_id: "beefeater", product: product({ id: "beefeater", category: "gin" }) }),
    ];
    const r = evaluate(negroni, inv);
    expect(r.state).toBe("unmakeable");
    expect(r.missing.length).toBeGreaterThanOrEqual(2);
  });

  test("insufficient level blocks just like a missing bottle", () => {
    const inv = [
      bottle({ id: "b1", product_id: "beefeater", level_ml: 10, product: product({ id: "beefeater", category: "gin" }) }),
      bottle({ id: "b2", product_id: "carpano", product: product({ id: "carpano", category: "vermouth" }) }),
      bottle({ id: "b3", product_id: "campari", product: product({ id: "campari", category: "amaro" }) }),
    ];
    const r = evaluate(negroni, inv);
    expect(r.state).toBe("one-away");
    expect(r.missing[0]).toBeDefined();
  });

  test("empty/archived bottles don't count", () => {
    const inv = [
      bottle({ id: "b1", product_id: "beefeater", status: "empty", product: product({ id: "beefeater", category: "gin" }) }),
      bottle({ id: "b2", product_id: "carpano", product: product({ id: "carpano", category: "vermouth" }) }),
      bottle({ id: "b3", product_id: "campari", product: product({ id: "campari", category: "amaro" }) }),
    ];
    expect(evaluate(negroni, inv).state).toBe("one-away");
  });
});

describe("evaluate() — optional / garnish / freeform", () => {
  test("garnish lines never block makeability", () => {
    const inv = [
      bottle({ id: "b1", product_id: "beefeater", product: product({ id: "beefeater", category: "gin" }) }),
      bottle({ id: "b2", product_id: "carpano", product: product({ id: "carpano", category: "vermouth" }) }),
      bottle({ id: "b3", product_id: "campari", product: product({ id: "campari", category: "amaro" }) }),
    ];
    // negroni already has the orange peel garnish — confirm we don't fail on it
    expect(evaluate(negroni, inv).state).toBe("makeable");
  });

  test("optional lines never block makeability", () => {
    const recipe = Recipe.parse({
      id: "improved",
      name: "Improved",
      ingredients: [
        { ref_type: "category", ref_id: "gin", amount: 60, unit: "ml" },
        { ref_type: "category", ref_id: "absinthe", amount: 1, unit: "dash", optional: true },
      ],
    });
    const inv = [bottle({ id: "b1", product_id: "beefeater", product: product({ id: "beefeater", category: "gin" }) })];
    expect(evaluate(recipe, inv).state).toBe("makeable");
  });

  test("freeform whitelist (water/ice/mint/etc) is free", () => {
    const inv = [
      bottle({ id: "b1", product_id: "rum-x", product: product({ id: "rum-x", category: "rum" }) }),
      bottle({ id: "b2", product_id: "lime-x", product: product({ id: "lime-x", category: "citrus" }) }),
      bottle({ id: "b3", product_id: "simp", product: product({ id: "simp", category: "syrup-simple" }) }),
    ];
    // mint/soda are freeform-OK; non-depleting leaf doesn't draw volume
    expect(evaluate(mojito, inv).state).toBe("makeable");
  });

  test("non-depleting unit binds without requiring volume", () => {
    const r = Recipe.parse({
      id: "egg-sour",
      name: "Egg Sour",
      ingredients: [
        { ref_type: "category", ref_id: "gin", amount: 60, unit: "ml" },
        { ref_type: "freeform", ref_id: "egg-white", amount: 1, unit: "each" },
      ],
    });
    const inv = [bottle({ id: "b1", product_id: "g", product: product({ id: "g", category: "gin" }) })];
    expect(evaluate(r, inv).state).toBe("makeable");
  });
});

describe("evaluate() — binding policy", () => {
  test("use-it-up picks the most-depleted valid bottle (lowest level_ml)", () => {
    const recipe = Recipe.parse({
      id: "gin-shot",
      name: "Gin Shot",
      ingredients: [{ ref_type: "category", ref_id: "gin", amount: 30, unit: "ml" }],
    });
    const inv = [
      bottle({ id: "b-full", product_id: "p1", level_ml: 700, product: product({ id: "p1", category: "gin" }) }),
      bottle({ id: "b-low",  product_id: "p2", level_ml: 50,  product: product({ id: "p2", category: "gin" }) }),
      bottle({ id: "b-mid",  product_id: "p3", level_ml: 300, product: product({ id: "p3", category: "gin" }) }),
    ];
    const r = evaluate(recipe, inv);
    expect(r.bindings[0]?.bottle_id).toBe("b-low");
  });

  test("freshest policy picks the most-full valid bottle", () => {
    const recipe = Recipe.parse({
      id: "gin-shot",
      name: "Gin Shot",
      ingredients: [{ ref_type: "category", ref_id: "gin", amount: 30, unit: "ml" }],
    });
    const inv = [
      bottle({ id: "b-full", product_id: "p1", level_ml: 700, product: product({ id: "p1", category: "gin" }) }),
      bottle({ id: "b-low",  product_id: "p2", level_ml: 50,  product: product({ id: "p2", category: "gin" }) }),
    ];
    const r = evaluate(recipe, inv, { policy: "freshest" });
    expect(r.bindings[0]?.bottle_id).toBe("b-full");
  });
});

describe("coverage() — shopping muse", () => {
  test("ranks un-owned products by recipes unlocked", () => {
    const recipes = new Map<string, ReturnType<typeof Recipe.parse>>();
    const r1 = Recipe.parse({
      id: "r1",
      name: "R1",
      ingredients: [
        { ref_type: "product", ref_id: "owned", amount: 30, unit: "ml" },
        { ref_type: "product", ref_id: "missing-a", amount: 30, unit: "ml" },
      ],
    });
    const r2 = Recipe.parse({
      id: "r2",
      name: "R2",
      ingredients: [
        { ref_type: "product", ref_id: "owned", amount: 30, unit: "ml" },
        { ref_type: "product", ref_id: "missing-a", amount: 30, unit: "ml" },
      ],
    });
    const r3 = Recipe.parse({
      id: "r3",
      name: "R3",
      ingredients: [
        { ref_type: "product", ref_id: "owned", amount: 30, unit: "ml" },
        { ref_type: "product", ref_id: "missing-b", amount: 30, unit: "ml" },
      ],
    });
    recipes.set("r1", r1);
    recipes.set("r2", r2);
    recipes.set("r3", r3);

    const inv = [bottle({ id: "b1", product_id: "owned" })];
    const oneAway = [
      { recipe_id: "r1", state: "one-away" as const, missing: ["missing-a"], bindings: [] },
      { recipe_id: "r2", state: "one-away" as const, missing: ["missing-a"], bindings: [] },
      { recipe_id: "r3", state: "one-away" as const, missing: ["missing-b"], bindings: [] },
    ];
    const cov = coverage(oneAway, recipes, inv);
    expect(cov[0]?.product).toBe("missing-a");
    expect(cov[0]?.unlocks).toHaveLength(2);
    expect(cov[1]?.product).toBe("missing-b");
    expect(cov[1]?.unlocks).toHaveLength(1);
  });
});
