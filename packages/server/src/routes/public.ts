/**
 * Public read-only endpoints under /guest — shareable recipe / product /
 * bottle cards. The operator UI's "Share" button copies a guest-UI URL
 * that backs onto these endpoints.
 *
 * Shapes are intentionally sanitized:
 *   - Recipes return their full ingredient list (the point of sharing).
 *   - Products return marketing-style metadata (distillery, origin, ABV).
 *   - Bottles return their *product* card plus bottle-level facts that an
 *     operator would happily show a guest (opened date, bottle size).
 *     Never the exact level_ml, never the slot, never the calibration.
 *
 * No authentication is required and no mutations are allowed. The router
 * is mounted only at `/guest` so we don't collide with the operator API.
 */
import { Hono } from "hono";
import {
  bottles as bottlesRepo,
  products as productsRepo,
  recipes as recipesRepo,
} from "@backbar/db";
import type { Deps } from "../deps";
import { err } from "../errors";

export interface PublicProduct {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  abv: number | null;
  distillery: string | null;
  origin_country: string | null;
  origin_region: string | null;
  age_statement_y: number | null;
  flavor_tags: string[];
  notes: string | null;
}

export interface PublicRecipeIngredient {
  label: string;
  amount: number | null;
  unit: string | null;
  optional: boolean;
  garnish: boolean;
}

export interface PublicRecipe {
  id: string;
  name: string;
  family: string | null;
  method: string | null;
  glass: string | null;
  ice: string | null;
  garnish: string | null;
  instructions: string | null;
  tags: string[];
  abv_estimate: number | null;
  ingredients: PublicRecipeIngredient[];
}

export interface PublicBottle {
  id: string;
  product: PublicProduct;
  full_ml: number;
  opened_at: number | null;
  purchased_at: number | null;
  /**
   * Coarse fullness bucket — "fresh" / "open" / "low" / "empty". The exact
   * level_ml is intentionally not exposed; sharing a bottle profile shouldn't
   * leak the bar's depletion state to a stranger with the link.
   */
  fullness: "fresh" | "open" | "low" | "empty";
}

function projectProduct(p: ReturnType<ReturnType<typeof productsRepo>["get"]>): PublicProduct | null {
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    subcategory: p.subcategory ?? null,
    abv: p.abv ?? null,
    distillery: p.distillery ?? null,
    origin_country: p.origin_country ?? null,
    origin_region: p.origin_region ?? null,
    age_statement_y: p.age_statement_y ?? null,
    flavor_tags: p.flavor_tags ?? [],
    notes: p.notes ?? null,
  };
}

function fullnessBucket(level_ml: number, full_ml: number): PublicBottle["fullness"] {
  if (full_ml <= 0) return "empty";
  const pct = level_ml / full_ml;
  if (pct <= 0.05) return "empty";
  if (pct < 0.25) return "low";
  if (pct < 0.85) return "open";
  return "fresh";
}

export function publicRouter(deps: Deps) {
  const r = new Hono();

  r.get("/recipes/:id", (c) => {
    const id = c.req.param("id");
    const recipe = recipesRepo(deps.db).get(id);
    if (!recipe) return err(c, 404, "not-found", `recipe '${id}'`);

    const productById = new Map(productsRepo(deps.db).list().map((p) => [p.id, p] as const));

    const ingredients: PublicRecipeIngredient[] = (recipe.ingredients ?? []).map((ing) => {
      const fallback =
        ing.ref_type === "product"
          ? productById.get(ing.ref_id ?? "")?.name ?? ing.ref_id ?? "?"
          : ing.ref_id ?? "?";
      return {
        label: ing.label ?? fallback,
        amount: ing.amount ?? null,
        unit: ing.unit ?? null,
        optional: Boolean(ing.optional),
        garnish: Boolean(ing.garnish),
      };
    });

    const payload: PublicRecipe = {
      id: recipe.id,
      name: recipe.name,
      family: recipe.family ?? null,
      method: recipe.method ?? null,
      glass: recipe.glass ?? null,
      ice: recipe.ice ?? null,
      garnish: recipe.garnish ?? null,
      instructions: recipe.instructions ?? null,
      tags: recipe.tags ?? [],
      abv_estimate: recipe.abv_estimate ?? null,
      ingredients,
    };
    return c.json(payload);
  });

  r.get("/products/:id", (c) => {
    const id = c.req.param("id");
    const p = productsRepo(deps.db).get(id);
    if (!p) return err(c, 404, "not-found", `product '${id}'`);
    const projected = projectProduct(p);
    if (!projected) return err(c, 404, "not-found", `product '${id}'`);
    return c.json(projected);
  });

  r.get("/bottles/:id", (c) => {
    const id = c.req.param("id");
    const bottle = bottlesRepo(deps.db).get(id);
    if (!bottle) return err(c, 404, "not-found", `bottle '${id}'`);
    const product = projectProduct(productsRepo(deps.db).get(bottle.product_id));
    if (!product) return err(c, 404, "not-found", `bottle '${id}' missing product`);

    const payload: PublicBottle = {
      id: bottle.id,
      product,
      full_ml: bottle.full_ml,
      opened_at: bottle.opened_at ?? null,
      purchased_at: bottle.purchased_at ?? null,
      fullness: fullnessBucket(bottle.level_ml, bottle.full_ml),
    };
    return c.json(payload);
  });

  return r;
}
