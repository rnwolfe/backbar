import { DENSITY_BY_CATEGORY } from "@backbar/core";
import type { DB } from "./client";
import { recipes } from "./repositories";
import { CANON_RECIPES } from "../seed/canon";

// Re-export so consumers of @backbar/db can read defaults without
// importing @backbar/core directly (spec §6 — category density defaults).
export { DENSITY_BY_CATEGORY } from "@backbar/core";
export { CANON_RECIPES } from "../seed/canon";

export interface SeedReport {
  recipesInserted: number;
  recipesSkipped: number;
  densities: Record<string, number>;
}

/**
 * Load layer-1 canon recipes + surface §6 category density defaults.
 *
 * Idempotent: skips recipes whose `id` is already present. Densities are
 * code constants in `@backbar/core` (no DB table); the seed exposes them
 * via the returned report so callers can confirm they're "loaded".
 */
export function seed(db: DB): SeedReport {
  const repo = recipes(db);
  let inserted = 0;
  let skipped = 0;
  for (const recipe of CANON_RECIPES) {
    const existing = repo.get(recipe.id);
    if (existing) {
      skipped += 1;
      continue;
    }
    repo.insert(recipe);
    inserted += 1;
  }
  return {
    recipesInserted: inserted,
    recipesSkipped: skipped,
    densities: { ...DENSITY_BY_CATEGORY },
  };
}
