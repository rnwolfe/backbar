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

    // Replacements: products with a depleted (empty / zero-level) bottle —
    // the signal the rapid sweep's "empty / gone" save produces. Coalesced by
    // product so a second emptied bottle of the same product updates one entry
    // instead of duplicating. Surfaced separately from `low` because empty
    // bottles fall out of the open/sealed low-stock window.
    const allBottles = bottlesRepo(deps.db).list();
    const depletedByProduct = new Map<string, typeof allBottles>();
    for (const b of allBottles) {
      if (b.status === "empty" || b.level_ml <= 0) {
        const list = depletedByProduct.get(b.product_id) ?? [];
        list.push(b);
        depletedByProduct.set(b.product_id, list);
      }
    }
    const replacements = [...depletedByProduct.entries()].map(([productId, depleted]) => {
      const remaining = allBottles.filter(
        (b) => b.product_id === productId && b.status !== "empty" && b.level_ml > 0,
      ).length;
      return {
        product: productMap.get(productId) ?? { id: productId },
        depleted_bottle_ids: depleted.map((b) => b.id),
        remaining_in_stock: remaining,
        out: remaining === 0,
      };
    });

    // Muse: greedy coverage from one-away recipes (uses cached makeable).
    const oneAway = deps.makeable.list().filter((m) => m.state === "one-away");
    const recipeMap = new Map(recipesRepo(deps.db).list().map((r) => [r.id, r] as const));
    const inv = loadInventory(deps.db);
    const muse = coverage(oneAway, recipeMap, inv).map((m) => ({
      product: productMap.get(m.product) ?? { id: m.product },
      unlocks: m.unlocks,
    }));

    return c.json({ low, replacements, muse });
  });

  return r;
}
