import { Hono } from "hono";
import { coverage } from "@backbar/core";
import { bottles as bottlesRepo, products as productsRepo, recipes as recipesRepo } from "@backbar/db";
import type { Deps } from "../deps";
import { isLowStock } from "../lowstock";
import { loadInventory } from "../makeable";

export function shoppingRouter(deps: Deps) {
  const r = new Hono();

  r.get("/", (c) => {
    // Low: bottles below threshold + denormalized product.
    const productMap = new Map(productsRepo(deps.db).list().map((p) => [p.id, p] as const));
    const low = bottlesRepo(deps.db)
      .list()
      .filter((b) => isLowStock(b))
      .map((b) => ({ ...b, product: productMap.get(b.product_id) ?? null }));

    // Muse: greedy coverage from one-away recipes (uses cached makeable).
    const oneAway = deps.makeable.list().filter((m) => m.state === "one-away");
    const recipeMap = new Map(recipesRepo(deps.db).list().map((r) => [r.id, r] as const));
    const inv = loadInventory(deps.db);
    const muse = coverage(oneAway, recipeMap, inv).map((m) => ({
      product: productMap.get(m.product) ?? { id: m.product },
      unlocks: m.unlocks,
    }));

    return c.json({ low, muse });
  });

  return r;
}
