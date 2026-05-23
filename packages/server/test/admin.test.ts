import { describe, expect, test } from "bun:test";
import { bottles, products, recipes } from "@backbar/db";
import { call, eventsFrom, setup } from "./_helpers";

describe("admin reset + reseed", () => {
  test("POST /admin/reset/bar clears bottles + products and reports counts", async () => {
    const { app, deps } = setup();
    const beforeBottles = bottles(deps.db).list().length;
    const beforeProducts = products(deps.db).list().length;
    expect(beforeBottles).toBeGreaterThan(0);
    expect(beforeProducts).toBeGreaterThan(0);

    const res = await call(app, "POST", "/admin/reset/bar");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; deleted: { bottles: number; products: number } };
    expect(body.ok).toBe(true);
    expect(body.deleted.bottles).toBe(beforeBottles);
    expect(body.deleted.products).toBe(beforeProducts);

    expect(bottles(deps.db).list().length).toBe(0);
    expect(products(deps.db).list().length).toBe(0);
    // Recipes untouched.
    expect(recipes(deps.db).list().length).toBeGreaterThan(0);
  });

  test("POST /admin/reset/bar emits makeable.changed for previously-makeable recipes", async () => {
    const { app, deps } = setup();
    deps.makeable.recompute(); // seed initial state
    const evts = await eventsFrom(deps, async () => {
      await call(app, "POST", "/admin/reset/bar");
    });
    const flipped = evts.filter((e) => e.type === "makeable.changed");
    expect(flipped.length).toBeGreaterThan(0);
    expect(flipped.every((e) => e.type === "makeable.changed" && e.state === "unmakeable")).toBe(true);
  });

  test("POST /admin/reset/recipes clears recipes only", async () => {
    const { app, deps } = setup();
    const beforeRecipes = recipes(deps.db).list().length;
    const beforeBottles = bottles(deps.db).list().length;

    const res = await call(app, "POST", "/admin/reset/recipes");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { deleted: { recipes: number } };
    expect(body.deleted.recipes).toBe(beforeRecipes);

    expect(recipes(deps.db).list().length).toBe(0);
    expect(bottles(deps.db).list().length).toBe(beforeBottles);
  });

  test("POST /admin/reseed loads the starter bar on a wiped DB", async () => {
    const { app, deps } = setup();
    await call(app, "POST", "/admin/reset/bar");
    await call(app, "POST", "/admin/reset/recipes");

    const res = await call(app, "POST", "/admin/reseed");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      report: {
        products: { inserted: number };
        bottles: { inserted: number };
        recipes: { inserted: number };
      };
    };
    expect(body.ok).toBe(true);
    expect(body.report.products.inserted).toBeGreaterThan(0);
    expect(body.report.bottles.inserted).toBeGreaterThan(0);
    expect(body.report.recipes.inserted).toBeGreaterThan(0);
    expect(products(deps.db).list().length).toBe(body.report.products.inserted);
  });
});
