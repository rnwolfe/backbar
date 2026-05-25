import { describe, expect, test } from "bun:test";
import { DENSITY_BY_CATEGORY, evaluate, type InvBottle } from "@backbar/core";
import { openMemory } from "../src/client";
import { migrate } from "../src/migrations";
import { bottles, nodes, pours, products, readings, recipes, sensorChannels } from "../src/repositories";
import {
  CANON_PRODUCTS,
  CANON_RECIPES,
  STARTER_BOTTLES,
  STARTER_NODES,
  seed,
} from "../src/seed";

const MUST_HAVE_RECIPES = [
  "old-fashioned",
  "negroni",
  "daiquiri",
  "manhattan",
  "martini",
  "margarita",
  "whiskey-sour",
  "jungle-bird",
  "mai-tai",
];

// Slugs every canon recipe references via ref_type:"product" — the starter
// catalog *must* satisfy these or makeability silently fails on a fresh DB.
const MUST_HAVE_PRODUCT_REFS = [
  "simple-syrup",
  "angostura-bitters",
  "campari",
  "peychauds-bitters",
  "absinthe",
  "orange-curacao",
  "orgeat",
];

describe("canon seed", () => {
  test("layer-1 classics named in spec §6.1 are all present", () => {
    const slugs = new Set(CANON_RECIPES.map((r) => r.id));
    for (const id of MUST_HAVE_RECIPES) expect(slugs.has(id)).toBe(true);
  });

  test("starter catalog covers every product ref the canon recipes name", () => {
    const ids = new Set(CANON_PRODUCTS.map((p) => p.id));
    for (const id of MUST_HAVE_PRODUCT_REFS) expect(ids.has(id)).toBe(true);
  });

  test("every starter bottle points at a real starter product", () => {
    const ids = new Set(CANON_PRODUCTS.map((p) => p.id));
    for (const b of STARTER_BOTTLES) expect(ids.has(b.product_id)).toBe(true);
  });

  test("loads products + bottles + recipes and reports counts", () => {
    const db = openMemory();
    migrate(db);
    const report = seed(db);

    expect(report.products.inserted).toBe(CANON_PRODUCTS.length);
    expect(report.products.skipped).toBe(0);
    expect(report.bottles.inserted).toBe(STARTER_BOTTLES.length);
    expect(report.bottles.skipped).toBe(0);
    expect(report.recipes.inserted).toBe(CANON_RECIPES.length);
    expect(report.recipes.skipped).toBe(0);

    expect(report.densities).toEqual(DENSITY_BY_CATEGORY);

    expect(products(db).list().length).toBe(CANON_PRODUCTS.length);
    expect(bottles(db).list().length).toBe(STARTER_BOTTLES.length);
    expect(recipes(db).list().length).toBe(CANON_RECIPES.length);
  });

  test("seeded inventory makes every canon recipe immediately makeable", () => {
    const db = openMemory();
    migrate(db);
    seed(db);

    const productMap = new Map(products(db).list().map((p) => [p.id, p] as const));
    const inv: InvBottle[] = bottles(db)
      .list()
      .map((b) => ({ ...b, product: productMap.get(b.product_id)! }));

    for (const recipe of recipes(db).list()) {
      const result = evaluate(recipe, inv);
      expect(result.state, `${recipe.id} should be makeable`).toBe("makeable");
    }
  });

  test("is idempotent — second seed inserts nothing", () => {
    const db = openMemory();
    migrate(db);
    seed(db);
    const second = seed(db);

    expect(second.products.inserted).toBe(0);
    expect(second.products.skipped).toBe(CANON_PRODUCTS.length);
    expect(second.bottles.inserted).toBe(0);
    expect(second.bottles.skipped).toBe(STARTER_BOTTLES.length);
    expect(second.recipes.inserted).toBe(0);
    expect(second.recipes.skipped).toBe(CANON_RECIPES.length);
    expect(second.nodes.inserted).toBe(0);
    expect(second.nodes.skipped).toBe(STARTER_NODES.length);
    expect(second.pours.inserted).toBe(0);
    expect(second.readings.inserted).toBe(0);
  });

  test("seeds fleet + history alongside catalog", () => {
    const db = openMemory();
    migrate(db);
    const report = seed(db);

    // Fleet — every starter node lands, some channels bound to bottles.
    expect(report.nodes.inserted).toBe(STARTER_NODES.length);
    expect(nodes(db).list().length).toBe(STARTER_NODES.length);
    const allChannels = sensorChannels(db).list();
    expect(allChannels.length).toBeGreaterThan(0);
    expect(allChannels.some((ch) => ch.bottle_id !== null)).toBe(true);

    // Pours — 28d of synthetic activity; ~140 pours all touching real bottles.
    expect(report.pours.inserted).toBeGreaterThan(50);
    const allPours = pours(db).list(500);
    for (const p of allPours) {
      expect(p.recipe_id).toBeTruthy();
      for (const b of p.bottles_used) expect(bottles(db).get(b.bottle_id)).not.toBeNull();
    }

    // Readings — 14 per bottle.
    for (const b of bottles(db).list()) {
      const rows = readings(db).forBottle(b.id, 20);
      expect(rows.length).toBe(14);
    }
  });

  test("recipe ids are slugs and event ids would be UUIDv7", async () => {
    for (const r of CANON_RECIPES) expect(r.id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    const { uuidv7 } = await import("../src/ids");
    const id = uuidv7();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
