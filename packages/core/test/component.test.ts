import { describe, expect, test } from "bun:test";
import { evaluate, type InvBottle } from "../src/makeability";
import { Component, Recipe } from "../src/schema";
import { toMl, UNIT_ML } from "../src/units";

const bottle = (over: Partial<InvBottle> & { id: string; product_id: string }): InvBottle => ({
  id: over.id,
  product_id: over.product_id,
  slot: null,
  tare_g: null,
  full_ml: over.full_ml ?? 750,
  level_ml: over.level_ml ?? 750,
  status: over.status ?? "open",
  tracked: false,
  opened_at: null,
  purchased_at: null,
  price_cents: null,
  product: {
    id: over.product_id,
    name: over.product_id,
    category: over.product?.category ?? "spirit",
    subcategory: null,
    abv: 0.4,
    density_g_ml: null,
    default_ml: 750,
    flavor_tags: [],
    notes: null,
  },
});

describe("units: cocktail-book conversions", () => {
  test("oz / tsp / tbsp / cup convert to ml", () => {
    expect(UNIT_ML.oz).toBeCloseTo(29.5735, 3);
    expect(toMl(2, "oz")).toBeCloseTo(59.147, 2);
    expect(toMl(0.75, "oz")).toBeCloseTo(22.18, 1);
    expect(toMl(1, "tsp")).toBeCloseTo(4.929, 2);
    expect(toMl(1, "tbsp")).toBeCloseTo(14.787, 2);
    expect(toMl(1, "cup")).toBeCloseTo(236.588, 2);
  });
});

describe("Component schema", () => {
  test("parses a homemade orgeat with pantry (freeform) ingredients", () => {
    const orgeat = Component.parse({
      id: "mazapan-orgeat",
      name: "Mazapán Orgeat",
      kind: "orgeat",
      instructions: "Blend until smooth. Refrigerate sealed.",
      keeps: "2 weeks refrigerated",
      ingredients: [
        { ref_type: "freeform", label: "almond milk", amount: 4, unit: "cup", sort: 0 },
        { ref_type: "freeform", label: "sugar", amount: 3, unit: "cup", sort: 1 },
        { ref_type: "freeform", label: "crumbled mazapán candy", amount: 1.5, unit: "cup", sort: 2 },
      ],
    });
    expect(orgeat.kind).toBe("orgeat");
    expect(orgeat.ingredients).toHaveLength(3);
  });
});

describe("makeability: component refs are non-blocking", () => {
  const mazapanInfante = Recipe.parse({
    id: "mazapan-infante",
    name: "Mazapán Infante",
    method: "shake",
    ingredients: [
      { ref_type: "category", ref_id: "tequila", amount: 2, unit: "oz", sort: 0 },
      { ref_type: "category", ref_id: "citrus", amount: 0.75, unit: "oz", sort: 1 },
      // The homemade component — you make it, so it must NOT block makeability.
      { ref_type: "component", ref_id: "mazapan-orgeat", label: "mazapán orgeat", amount: 0.75, unit: "oz", sort: 2 },
      { ref_type: "freeform", label: "freshly grated nutmeg", garnish: true, sort: 3 },
    ],
  });

  test("makeable when the two real spirits are on hand (orgeat ignored)", () => {
    const inv = [
      bottle({ id: "b-teq", product_id: "blanco", product: { category: "tequila" } as never, level_ml: 700 }),
      bottle({ id: "b-lime", product_id: "lime", product: { category: "citrus" } as never, level_ml: 400 }),
    ];
    const res = evaluate(mazapanInfante, inv);
    expect(res.state).toBe("makeable");
    // The component ref binds nothing (not a tracked bottle).
    expect(res.bindings.some((b) => b.ref.includes("orgeat"))).toBe(false);
  });

  test("unmakeable reason never cites the component", () => {
    const inv = [bottle({ id: "b-teq", product_id: "blanco", product: { category: "tequila" } as never })];
    const res = evaluate(mazapanInfante, inv);
    expect(res.state).not.toBe("makeable"); // missing citrus
    expect(res.missing.join(" ").toLowerCase()).not.toContain("orgeat");
  });

  describe("component gating (blocks_makeability + on_hand)", () => {
    const fullBar = [
      bottle({ id: "b-teq", product_id: "blanco", product: { category: "tequila" } as never, level_ml: 700 }),
      bottle({ id: "b-lime", product_id: "lime", product: { category: "citrus" } as never, level_ml: 400 }),
    ];

    test("non-blocking component: makeable even when not on hand (default)", () => {
      const res = evaluate(mazapanInfante, fullBar, {
        components: [{ id: "mazapan-orgeat", blocks_makeability: false, on_hand: false }],
      });
      expect(res.state).toBe("makeable");
    });

    test("blocking component, not on hand → blocks (one-away here)", () => {
      const res = evaluate(mazapanInfante, fullBar, {
        components: [{ id: "mazapan-orgeat", blocks_makeability: true, on_hand: false }],
      });
      expect(res.state).toBe("one-away");
      expect(res.missing.join(" ").toLowerCase()).toContain("orgeat");
    });

    test("blocking component, on hand → makeable", () => {
      const res = evaluate(mazapanInfante, fullBar, {
        components: [{ id: "mazapan-orgeat", blocks_makeability: true, on_hand: true }],
      });
      expect(res.state).toBe("makeable");
    });

    test("unknown component id → does not block", () => {
      const res = evaluate(mazapanInfante, fullBar, { components: [] });
      expect(res.state).toBe("makeable");
    });
  });
});
