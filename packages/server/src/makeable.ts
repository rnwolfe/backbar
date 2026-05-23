import {
  evaluate,
  type InvBottle,
  type MakeabilityState,
  type Recipe,
  type Result,
} from "@backbar/core";
import {
  bottles as bottlesRepo,
  products as productsRepo,
  recipes as recipesRepo,
  type DB,
} from "@backbar/db";

/**
 * Denormalized recipe summary returned alongside a `Result` per spec api.md §1
 * so the operator UI can render without joining client-side.
 */
export interface MakeableItem extends Result {
  recipe: {
    name: string;
    family: string | null | undefined;
    glass: string | null | undefined;
    ice: string | null | undefined;
    garnish: string | null | undefined;
    is_published: boolean;
  };
}

/**
 * Loads the inventory snapshot the makeability engine evaluates against —
 * pure DB read, no caching here (caller decides when to invalidate).
 */
export function loadInventory(db: DB): InvBottle[] {
  const productMap = new Map(productsRepo(db).list().map((p) => [p.id, p] as const));
  const inv: InvBottle[] = [];
  for (const b of bottlesRepo(db).list()) {
    const product = productMap.get(b.product_id);
    if (!product) continue;
    inv.push({ ...b, product });
  }
  return inv;
}

/**
 * In-memory makeable cache (§api.md §1). Recomputed on inventory change
 * (`recompute()` called from the ingest core + after recipe/bottle writes);
 * the `/makeable` endpoint just returns the cached snapshot.
 *
 * Also tracks per-recipe state transitions so `makeable.changed` events can
 * fire only when state actually flips.
 */
export class MakeableCache {
  private snapshot: MakeableItem[] = [];
  private statesByRecipe = new Map<string, MakeabilityState>();

  constructor(private readonly db: DB) {}

  /**
   * Recompute all recipes and return the set of recipes whose state changed.
   * The cache is replaced wholesale; callers can read it via `list()`.
   */
  recompute(): { changed: { recipe_id: string; state: MakeabilityState }[]; snapshot: MakeableItem[] } {
    const inv = loadInventory(this.db);
    const recipes: Recipe[] = recipesRepo(this.db).list();

    const next: MakeableItem[] = recipes.map((r) => ({
      ...evaluate(r, inv),
      recipe: {
        name: r.name,
        family: r.family,
        glass: r.glass,
        ice: r.ice,
        garnish: r.garnish,
        is_published: r.is_published,
      },
    }));

    const nextStates = new Map<string, MakeabilityState>();
    const changed: { recipe_id: string; state: MakeabilityState }[] = [];

    for (const item of next) {
      nextStates.set(item.recipe_id, item.state);
      const prev = this.statesByRecipe.get(item.recipe_id);
      if (prev !== item.state) {
        changed.push({ recipe_id: item.recipe_id, state: item.state });
      }
    }
    // Recipes that disappeared still count as transitions (deletion).
    for (const [id] of this.statesByRecipe) {
      if (!nextStates.has(id)) changed.push({ recipe_id: id, state: "unmakeable" });
    }

    this.snapshot = next;
    this.statesByRecipe = nextStates;
    return { changed, snapshot: next };
  }

  list(): MakeableItem[] {
    return this.snapshot;
  }
}
