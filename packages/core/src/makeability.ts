import { isNonDepleting, toMl } from "./units";
import type { Bottle, Product, Recipe, RecipeIngredient } from "./schema";

/** Bottle joined to its catalog product (the shape the engine works on). */
export type InvBottle = Bottle & { product: Product };

export interface Binding {
  /** Ingredient ref_id or label that this binding satisfies. */
  ref: string;
  bottle_id: string;
  ml: number;
}

export type MakeabilityState = "makeable" | "one-away" | "unmakeable";

export interface Result {
  recipe_id: string;
  state: MakeabilityState;
  /** Ingredient labels that could not be satisfied. */
  missing: string[];
  /** For makeable recipes: which bottle pours each required line. */
  bindings: Binding[];
}

export type BindingPolicy = "use-it-up" | "freshest";

/**
 * Free-form ingredient ids that never require a bottle binding — the bar
 * has water/ice/etc. baseline. Recipes can still call these out for the UX.
 */
export const FREEFORM_OK: ReadonlySet<string> = new Set([
  "egg-white",
  "egg",
  "egg-yolk",
  "soda",
  "club-soda",
  "tonic",
  "water",
  "ice",
  "mint",
  "salt",
  "pepper",
  "sugar",
]);

function candidates(ing: RecipeIngredient, inv: InvBottle[]): InvBottle[] {
  switch (ing.ref_type) {
    case "product":
      return inv.filter((b) => b.product_id === ing.ref_id);
    case "category":
      return inv.filter((b) => b.product.category === ing.ref_id);
    case "tag":
      return inv.filter((b) => b.product.flavor_tags.includes(ing.ref_id ?? ""));
    case "freeform":
      return [];
  }
}

function ingredientLabel(ing: RecipeIngredient): string {
  return ing.label ?? ing.ref_id ?? "?";
}

/**
 * Evaluate a single recipe against current inventory.
 *
 * - Optional and garnish-only ingredients never block makeability.
 * - Non-depleting units (each / leaf) only require that ≥1 candidate exists.
 * - Binding picks the most-depleted valid bottle (use-it-up) by default;
 *   `freshest` flips the comparator.
 */
export function evaluate(
  recipe: Recipe,
  inv: InvBottle[],
  opts: { policy?: BindingPolicy } = {},
): Result {
  const policy: BindingPolicy = opts.policy ?? "use-it-up";
  const missing: string[] = [];
  const bindings: Binding[] = [];

  for (const ing of recipe.ingredients) {
    if (ing.optional || ing.garnish) continue;

    if (ing.ref_type === "freeform") {
      const id = ing.ref_id ?? "";
      if (!FREEFORM_OK.has(id)) missing.push(ingredientLabel(ing));
      continue;
    }

    const cands = candidates(ing, inv).filter(
      (b) => b.status === "open" || b.status === "sealed",
    );

    if (cands.length === 0) {
      missing.push(ingredientLabel(ing));
      continue;
    }

    if (isNonDepleting(ing.unit ?? null)) {
      // Just need a usable bottle — bind ml=0 so a pour doesn't draw from it.
      const pick = cands[0]!;
      bindings.push({ ref: ing.ref_id ?? ingredientLabel(ing), bottle_id: pick.id, ml: 0 });
      continue;
    }

    const need = toMl(ing.amount ?? 0, ing.unit ?? "ml");
    const ok = cands.filter((b) => b.level_ml >= need);
    if (ok.length === 0) {
      missing.push(ingredientLabel(ing));
      continue;
    }

    ok.sort((a, b) =>
      policy === "use-it-up" ? a.level_ml - b.level_ml : b.level_ml - a.level_ml,
    );
    bindings.push({
      ref: ing.ref_id ?? ingredientLabel(ing),
      bottle_id: ok[0]!.id,
      ml: need,
    });
  }

  const state: MakeabilityState =
    missing.length === 0 ? "makeable" : missing.length === 1 ? "one-away" : "unmakeable";

  return { recipe_id: recipe.id, state, missing, bindings };
}

/**
 * Shopping muse: greedy coverage over un-owned candidate products.
 * For each one-away recipe, charge the *first* missing un-owned product
 * with the recipe's name; rank products by how many recipes they unlock.
 */
export function coverage(
  oneAway: Result[],
  recipes: Map<string, Recipe>,
  inv: InvBottle[],
): { product: string; unlocks: string[] }[] {
  const owned = new Set(inv.map((b) => b.product_id));
  const score = new Map<string, string[]>();

  for (const r of oneAway) {
    const rec = recipes.get(r.recipe_id);
    if (!rec) continue;
    const miss = rec.ingredients.find(
      (i) =>
        !i.optional &&
        !i.garnish &&
        i.ref_type === "product" &&
        !owned.has(i.ref_id ?? ""),
    );
    const key = miss?.ref_id;
    if (!key) continue;
    const list = score.get(key) ?? [];
    list.push(rec.name);
    score.set(key, list);
  }

  return [...score]
    .map(([product, unlocks]) => ({ product, unlocks }))
    .sort((a, b) => b.unlocks.length - a.unlocks.length);
}
