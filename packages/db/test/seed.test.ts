import { describe, expect, test } from "bun:test";
import { DENSITY_BY_CATEGORY } from "@backbar/core";
import { openMemory } from "../src/client";
import { migrate } from "../src/migrations";
import { recipes } from "../src/repositories";
import { CANON_RECIPES, seed } from "../src/seed";

const MUST_HAVE = [
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

describe("canon seed", () => {
  test("layer-1 classics named in spec §6.1 are all present", () => {
    const slugs = new Set(CANON_RECIPES.map((r) => r.id));
    for (const id of MUST_HAVE) expect(slugs.has(id)).toBe(true);
  });

  test("loads recipes + reports density defaults from §6", () => {
    const db = openMemory();
    migrate(db);
    const report = seed(db);

    expect(report.recipesInserted).toBe(CANON_RECIPES.length);
    expect(report.recipesSkipped).toBe(0);
    // §6 categories must round-trip through the seed report.
    expect(report.densities["spirit"]).toBe(0.95);
    expect(report.densities["syrup-simple"]).toBe(1.22);
    expect(report.densities["syrup-rich"]).toBe(1.3);
    expect(report.densities["amaro"]).toBe(1.08);
    expect(report.densities).toEqual(DENSITY_BY_CATEGORY);

    const rows = recipes(db).list();
    expect(rows.length).toBe(CANON_RECIPES.length);

    const negroni = rows.find((r) => r.id === "negroni");
    expect(negroni).toBeDefined();
    expect(negroni?.ingredients.length).toBe(4);
    // Equal-parts negroni: gin / Campari / sweet vermouth at 30 ml each.
    const amounts = negroni!.ingredients
      .filter((i) => !i.garnish)
      .map((i) => i.amount);
    expect(amounts).toEqual([30, 30, 30]);
  });

  test("is idempotent — second seed inserts nothing", () => {
    const db = openMemory();
    migrate(db);
    seed(db);
    const second = seed(db);
    expect(second.recipesInserted).toBe(0);
    expect(second.recipesSkipped).toBe(CANON_RECIPES.length);
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
