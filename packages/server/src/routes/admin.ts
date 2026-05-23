import { Hono } from "hono";
import {
  bottles as bottlesRepo,
  products as productsRepo,
  recipes as recipesRepo,
  seed,
  type SeedReport,
} from "@backbar/db";
import type { Deps } from "../deps";

/**
 * Local-only admin actions for clearing and reseeding the bar.
 *
 * Each handler emits `makeable.changed` for every recipe whose state flips
 * so connected UIs stay coherent without a full hydrate (they can re-pull
 * the wiped tables themselves — those don't have WS events). The actions
 * are unguarded by design: this is a single-operator local-first app.
 */
export function adminRouter(deps: Deps) {
  const r = new Hono();

  r.post("/reset/bar", (c) => {
    // FK order: bottles (readings cascade) before products.
    const bottlesDeleted = bottlesRepo(deps.db).deleteAll();
    const productsDeleted = productsRepo(deps.db).deleteAll();
    emitMakeableChanges(deps);
    return c.json({
      ok: true,
      deleted: { bottles: bottlesDeleted, products: productsDeleted },
    });
  });

  r.post("/reset/recipes", (c) => {
    const recipesDeleted = recipesRepo(deps.db).deleteAll();
    emitMakeableChanges(deps);
    return c.json({ ok: true, deleted: { recipes: recipesDeleted } });
  });

  r.post("/reseed", (c) => {
    const report: SeedReport = seed(deps.db);
    emitMakeableChanges(deps);
    return c.json({ ok: true, report });
  });

  return r;
}

function emitMakeableChanges(deps: Deps): void {
  const { changed } = deps.makeable.recompute();
  for (const ch of changed) deps.bus.emit({ type: "makeable.changed", ...ch });
}
