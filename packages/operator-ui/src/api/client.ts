import type {
  Bottle,
  Node as NodeRow,
  Product,
  Recipe,
} from "@backbar/core";

export type BottleWithProduct = Bottle & { product: Product | null };

export interface MakeableItem {
  recipe_id: string;
  state: "makeable" | "one-away" | "unmakeable";
  missing: string[];
  bindings: { ref: string; bottle_id: string; ml: number }[];
  recipe: {
    name: string;
    family: string | null | undefined;
    glass: string | null | undefined;
    ice: string | null | undefined;
    garnish: string | null | undefined;
    is_published: boolean;
  };
}

export interface ShoppingList {
  low: BottleWithProduct[];
  muse: { product: Partial<Product> & { id: string }; unlocks: string[] }[];
}

export interface AdminResetBarResponse {
  ok: boolean;
  deleted: { bottles: number; products: number };
}

export interface AdminResetRecipesResponse {
  ok: boolean;
  deleted: { recipes: number };
}

export interface AdminReseedResponse {
  ok: boolean;
  report: {
    products: { inserted: number; skipped: number };
    bottles: { inserted: number; skipped: number };
    recipes: { inserted: number; skipped: number };
  };
}

/**
 * In dev, Vite proxies `/api/*` → `http://localhost:8787`. In prod (when the
 * UI is served by the same Bun process or a static host) point `VITE_API_BASE`
 * at the API root and the WS at the same origin.
 */
export const apiBase = import.meta.env.VITE_API_BASE ?? "/api";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${path}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  products: () => req<Product[]>("/products"),
  bottles: () => req<BottleWithProduct[]>("/bottles"),
  recipes: () => req<Recipe[]>("/recipes"),
  makeable: () => req<MakeableItem[]>("/makeable"),
  nodes: () => req<NodeRow[]>("/nodes"),
  shopping: () => req<ShoppingList>("/shopping-list"),
  pour: (body: { recipe_id: string; overrides?: { bottle_id: string; ml: number }[] }) =>
    req<unknown>("/pour", { method: "POST", body: JSON.stringify(body) }),
  ideate: (brief: string, mode = "make-now") =>
    req<unknown>("/ai/ideate", { method: "POST", body: JSON.stringify({ brief, mode }) }),
  publishMenu: () => req<{ url: string; count: number }>("/menu/publish", { method: "POST" }),
  adminResetBar: () => req<AdminResetBarResponse>("/admin/reset/bar", { method: "POST" }),
  adminResetRecipes: () => req<AdminResetRecipesResponse>("/admin/reset/recipes", { method: "POST" }),
  adminReseed: () => req<AdminReseedResponse>("/admin/reseed", { method: "POST" }),
};
