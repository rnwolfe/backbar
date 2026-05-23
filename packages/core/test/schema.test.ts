import { describe, expect, test } from "bun:test";
import {
  Balance,
  Bottle,
  ManualReading,
  Node,
  Pour,
  Product,
  Reading,
  Recipe,
  RecipeIngredient,
  SensorChannel,
  WeightReading,
} from "../src/schema";

describe("Product", () => {
  test("requires kebab-case slug id", () => {
    expect(() => Product.parse({ id: "Beefeater_London", name: "x", category: "gin" })).toThrow();
    expect(Product.parse({ id: "beefeater-london-dry", name: "Beefeater", category: "gin" }).flavor_tags).toEqual([]);
  });

  test("abv must be 0..1", () => {
    expect(() => Product.parse({ id: "x", name: "x", category: "gin", abv: 1.2 })).toThrow();
  });
});

describe("Bottle", () => {
  test("level_ml must be ≥ 0; full_ml must be > 0", () => {
    expect(() =>
      Bottle.parse({ id: "b1", product_id: "p", full_ml: 0, level_ml: 0 }),
    ).toThrow();
    expect(() =>
      Bottle.parse({ id: "b1", product_id: "p", full_ml: 750, level_ml: -1 }),
    ).toThrow();
  });

  test("status defaults to open and tracked coerces", () => {
    const b = Bottle.parse({ id: "b1", product_id: "p", full_ml: 750, level_ml: 750, tracked: 1 });
    expect(b.status).toBe("open");
    expect(b.tracked).toBe(true);
  });
});

describe("Reading", () => {
  test("source enum is enforced", () => {
    expect(() =>
      Reading.parse({ id: "r", bottle_id: "b", level_ml: 0, source: "spilled", ts: 0 }),
    ).toThrow();
  });
});

describe("Recipe / RecipeIngredient", () => {
  test("defaults: empty tags + ingredients, is_published false", () => {
    const r = Recipe.parse({ id: "old-fashioned", name: "Old Fashioned" });
    expect(r.tags).toEqual([]);
    expect(r.ingredients).toEqual([]);
    expect(r.is_published).toBe(false);
  });

  test("ingredient ref_type enum + unit enum enforced", () => {
    expect(() => RecipeIngredient.parse({ ref_type: "magic" })).toThrow();
    expect(() => RecipeIngredient.parse({ ref_type: "product", unit: "tbsp" })).toThrow();
  });
});

describe("Balance", () => {
  test("all axes are required and 0..1", () => {
    expect(() =>
      Balance.parse({ sweet: 0, sour: 0, bitter: 0, strong: 0, aromatic: 0 }),
    ).toThrow();
    expect(() =>
      Balance.parse({
        sweet: 1.5, sour: 0, bitter: 0, strong: 0, aromatic: 0, dilution: 0,
      }),
    ).toThrow();
  });
});

describe("Pour / SensorChannel / Node", () => {
  test("Pour requires bottles_used array", () => {
    expect(() => Pour.parse({ id: "p", made_at: 0 })).toThrow();
    expect(
      Pour.parse({ id: "p", made_at: 0, bottles_used: [{ bottle_id: "b", ml: 30 }] }).bottles_used,
    ).toHaveLength(1);
  });

  test("SensorChannel keys are device_id + channel", () => {
    const c = SensorChannel.parse({ device_id: "shelf-a", channel: 0, slot: "A1" });
    expect(c.bottle_id).toBeFalsy();
  });

  test("Node status defaults to offline", () => {
    const n = Node.parse({ device_id: "shelf-a" });
    expect(n.status).toBe("offline");
  });
});

describe("Ingest payloads", () => {
  test("ManualReading is authoritative shape", () => {
    expect(ManualReading.parse({ bottle_id: "b", level_ml: 0 }).level_ml).toBe(0);
    expect(() => ManualReading.parse({ bottle_id: "b" })).toThrow();
  });

  test("WeightReading carries raw grams + ts", () => {
    const w = WeightReading.parse({ device_id: "shelf-a", channel: 0, raw_g: 1234.5, ts: 1 });
    expect(w.raw_g).toBe(1234.5);
  });
});
