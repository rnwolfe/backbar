/**
 * Resolution glue between a spec's ingredient refs and the flavor corpus.
 * The tools and the server-side guardrail both resolve refs → flavor profiles
 * (product → tag → category fallback) and → BalanceIngredient[] here, so the
 * model's reasoning and the authoritative re-check use identical math.
 */
import {
  type BalanceIngredient,
  type FlavorProfile,
  type IngredientRole,
  type Unit,
  profileToBalanceIngredient,
  toMl,
} from "@backbar/core";
import { flavorProfiles, products } from "@backbar/db";
import type { Deps } from "../../deps";

export interface ToolIngredient {
  ref: string;
  amount: number;
  unit: Unit;
}

/**
 * Resolve a ref to a flavor profile. Tries the corpus directly (product slug,
 * tag value, or category id), then falls back to the ref's product category.
 * Returns null when nothing resolves — callers degrade gracefully.
 */
export function resolveProfile(deps: Deps, ref: string): FlavorProfile | null {
  const direct = flavorProfiles(deps.db).get(ref);
  if (direct) return direct;
  const product = products(deps.db).get(ref);
  if (product) {
    const byCategory = flavorProfiles(deps.db).get(product.category);
    if (byCategory) return { ...byCategory, ref, ref_type: "product" };
  }
  return null;
}

export function resolveRole(deps: Deps, ref: string): IngredientRole {
  return resolveProfile(deps, ref)?.role ?? "other";
}

/** Spirit sub-style tags → their base category (for cuisine affinity etc.). */
const TAG_TO_CATEGORY: Record<string, string> = {
  "white-rum": "rum",
  "aged-rum": "rum",
  "jamaican-rum": "rum",
  "blackstrap-rum": "rum",
  "blanco-tequila": "tequila",
};

/** Resolve a ref to its base spirit category: product.category → tag map → ref. */
export function resolveSpiritCategory(deps: Deps, ref: string): string {
  const product = products(deps.db).get(ref);
  if (product) return product.category;
  return TAG_TO_CATEGORY[ref] ?? ref;
}

/** Real ABV for a ref: a product's declared abv wins over the profile default. */
function abvFor(deps: Deps, ref: string, profile: FlavorProfile | null): number {
  const product = products(deps.db).get(ref);
  if (product?.abv != null) return product.abv;
  return profile?.typical_abv ?? 0;
}

/** Resolve one ingredient line into a BalanceIngredient (ml + abv + axes). */
export function resolveBalanceIngredient(deps: Deps, ing: ToolIngredient): BalanceIngredient {
  const profile = resolveProfile(deps, ing.ref);
  const amount_ml = toMl(ing.amount, ing.unit);
  if (!profile) return { amount_ml, abv: abvFor(deps, ing.ref, null), axes: {} };
  return profileToBalanceIngredient(profile, amount_ml, abvFor(deps, ing.ref, profile));
}

export function resolveBalanceIngredients(deps: Deps, ings: ToolIngredient[]): BalanceIngredient[] {
  return ings.map((i) => resolveBalanceIngredient(deps, i));
}

/** Roles + ml for family classification. */
export function resolveRoles(deps: Deps, ings: ToolIngredient[]): { role: IngredientRole }[] {
  return ings.map((i) => ({ role: resolveRole(deps, i.ref) }));
}
