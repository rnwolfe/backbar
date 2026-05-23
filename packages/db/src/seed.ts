import { DENSITY_BY_CATEGORY } from "@backbar/core";
import type { DB } from "./client";
import { bottles, products, recipes } from "./repositories";
import { STARTER_BOTTLES } from "../seed/bottles";
import { CANON_PRODUCTS } from "../seed/products";
import { CANON_RECIPES } from "../seed/canon";

// Re-export so consumers of @backbar/db can read defaults without
// importing @backbar/core directly (spec §6 — category density defaults).
export { DENSITY_BY_CATEGORY } from "@backbar/core";
export { CANON_RECIPES } from "../seed/canon";
export { CANON_PRODUCTS } from "../seed/products";
export { STARTER_BOTTLES } from "../seed/bottles";

interface InsertCounts {
  inserted: number;
  skipped: number;
}

export interface SeedReport {
  products: InsertCounts;
  bottles: InsertCounts;
  recipes: InsertCounts;
  densities: Record<string, number>;
}

/**
 * Load the layer-1 starter bar: products → bottles → canon recipes, plus
 * surface §6 category density defaults.
 *
 * Idempotent: every row is keyed by a stable slug, so reseed only inserts
 * what's missing. Bottles use `bottle-<product-id>` ids for predictability
 * after a `/admin/reset/bar` + reseed cycle.
 *
 * Order matters — bottles FK to products (RESTRICT), so products must be in
 * before bottles. Recipes have no FK to either side and could be inserted
 * first, but we keep them last so the report reads top-to-bottom in the same
 * order the operator UI surfaces them.
 */
export function seed(db: DB): SeedReport {
  const productsRepo = products(db);
  const bottlesRepo = bottles(db);
  const recipesRepo = recipes(db);

  const productCounts: InsertCounts = { inserted: 0, skipped: 0 };
  for (const p of CANON_PRODUCTS) {
    if (productsRepo.get(p.id)) {
      productCounts.skipped += 1;
      continue;
    }
    productsRepo.insert(p);
    productCounts.inserted += 1;
  }

  const bottleCounts: InsertCounts = { inserted: 0, skipped: 0 };
  for (const b of STARTER_BOTTLES) {
    if (bottlesRepo.get(b.id)) {
      bottleCounts.skipped += 1;
      continue;
    }
    bottlesRepo.insert(b);
    bottleCounts.inserted += 1;
  }

  const recipeCounts: InsertCounts = { inserted: 0, skipped: 0 };
  for (const r of CANON_RECIPES) {
    if (recipesRepo.get(r.id)) {
      recipeCounts.skipped += 1;
      continue;
    }
    recipesRepo.insert(r);
    recipeCounts.inserted += 1;
  }

  return {
    products: productCounts,
    bottles: bottleCounts,
    recipes: recipeCounts,
    densities: { ...DENSITY_BY_CATEGORY },
  };
}
