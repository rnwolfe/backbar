import { describe, expect, test } from "bun:test";
import { openMemory } from "../src/client";
import { migrate } from "../src/migrations";
import { bottles, products, queries } from "../src/repositories";

function setup() {
  const db = openMemory();
  migrate(db);
  products(db).insert({
    id: "gin",
    name: "Generic Gin",
    category: "gin",
    flavor_tags: [],
  });
  products(db).insert({
    id: "rye",
    name: "Generic Rye",
    category: "rye",
    flavor_tags: [],
  });
  return db;
}

describe("low_stock view", () => {
  test("returns bottles below max(15% full, 60 ml)", () => {
    const db = setup();
    // 750 * 0.15 = 112.5 -> threshold is 112.5
    bottles(db).insert({
      id: "b-full", product_id: "gin", full_ml: 750, level_ml: 600, status: "open", tracked: false,
    });
    bottles(db).insert({
      id: "b-low", product_id: "gin", full_ml: 750, level_ml: 50, status: "open", tracked: false,
    });
    // Tiny bottle (375 * 0.15 = 56.25) — floor of 60 ml dominates.
    bottles(db).insert({
      id: "b-tiny-ok", product_id: "rye", full_ml: 375, level_ml: 65, status: "open", tracked: false,
    });
    bottles(db).insert({
      id: "b-tiny-low", product_id: "rye", full_ml: 375, level_ml: 55, status: "open", tracked: false,
    });
    bottles(db).insert({
      id: "b-empty-archived", product_id: "gin", full_ml: 750, level_ml: 0, status: "archived", tracked: false,
    });

    const low = queries(db).lowStock();
    const ids = low.map((b) => b.id).sort();
    expect(ids).toEqual(["b-low", "b-tiny-low"]);
  });
});

describe("shopping_list view", () => {
  test("lists products with no healthy bottle", () => {
    const db = setup();
    // gin: has a healthy bottle → not on list
    bottles(db).insert({
      id: "b-gin", product_id: "gin", full_ml: 750, level_ml: 600, status: "open", tracked: false,
    });
    // rye: only a low bottle → on list
    bottles(db).insert({
      id: "b-rye-low", product_id: "rye", full_ml: 750, level_ml: 30, status: "open", tracked: false,
    });
    // also add a product with zero bottles — should appear too
    products(db).insert({
      id: "campari", name: "Campari", category: "amaro", flavor_tags: [],
    });

    const list = queries(db).shoppingList();
    const ids = list.map((r) => r.product_id).sort();
    expect(ids).toEqual(["campari", "rye"]);
  });
});
