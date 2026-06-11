import type {
  Bottle,
  Category,
  Node as NodeRow,
  Product,
  Reading,
  Recipe,
} from "@backbar/core";

export type BottleWithProduct = Bottle & { product: Product | null };

export interface NodeWithChannels extends NodeRow {
  channels_total: number;
  channels_occupied: number;
  channels: { channel: number; slot: string; bottle_id: string | null; calibrated: boolean }[];
}

export interface PourRow {
  id: string;
  recipe_id: string | null;
  recipe_name: string | null;
  made_at: number;
  ml: number;
  bottles_used: { bottle_id: string; ml: number }[];
}

export interface PourSummaryDay {
  day_index: number;
  day_start: number;
  pours: number;
  ml: number;
  top_recipe_id: string | null;
  top_recipe_name: string | null;
}

export interface TopRecipeRow {
  recipe_id: string;
  recipe_name: string;
  count: number;
  ml: number;
}

export interface TopBottleRow {
  bottle_id: string;
  ml: number;
}

export interface BottleDetail {
  bottle: Bottle & { product: Product | null };
  readings: Reading[];
  stats: {
    pours_28d: number;
    ml_dispensed_28d: number;
    opened_days_ago: number | null;
    est_empty_days: number | null;
    avg_ml_per_pour: number | null;
  };
  calibration: {
    device_id: string;
    channel: number;
    slot: string;
    tare_g: number | null;
    slope: number | null;
    offset: number | null;
    density_g_ml: number | null;
  } | null;
}

export interface RawSample {
  device_id: string;
  channel: number;
  raw_g: number;
  ts: number;
}

export interface BottleSample extends RawSample {
  channel_info: { device_id: string; channel: number; slot: string };
}

export interface CalibrateRequest {
  channel: number;
  empty_raw: number;
  known_raw: number;
  known_g: number;
}

export interface CalibrateResponse {
  channel: {
    device_id: string;
    channel: number;
    slot: string;
    bottle_id: string | null;
    cal_slope: number | null;
    cal_offset: number | null;
  };
  cal: { slope: number; offset: number };
}

/**
 * Server's /ai/ideate envelope. `ok:true` carries the validated spec; the
 * `ok:false` paths surface a structured reason so the UI can show *why* the
 * model gave up rather than silently swapping in a mock recipe.
 *
 * Shape mirrors `packages/server/src/ai/schema.ts#GeneratedSpec` 1:1. The AI
 * does NOT emit human labels — `product_ref` is the catalog id and callers
 * must look up the display name from the products store.
 */
export interface IdeateSpec {
  name: string;
  family: string;
  method: string;
  ratios: string;
  glass: string;
  ice: string;
  garnish: string;
  abv_estimate: number;
  predicted_balance: { sweet: number; sour: number; bitter: number; strong: number; aromatic: number; dilution: number };
  ingredients: {
    product_ref: string;
    ref_type: "product" | "category";
    amount: number;
    unit: "ml" | "dash" | "barspoon" | "top";
  }[];
  rationale: string;
  risk_note: string;
}

export type IdeateResponse =
  | { ok: true; spec: IdeateSpec; attempts?: number }
  | {
      ok: false;
      reason: "off-inventory" | "bad-input" | "no-model" | string;
      violation?: unknown;
      last_spec?: IdeateSpec;
      attempts?: number;
      muse_hint?: string;
    };

/**
 * /recipes/import-photo response — see `packages/server/src/ai/schema.ts#ImportedRecipe`.
 * Unlike GeneratedSpec, photo-import ingredients DO carry a `label` (raw
 * extracted text) because no catalog id is known yet; the server then
 * fuzzy-matches each label and reports unresolved entries.
 */
export interface ImportedRecipeDraft {
  name: string;
  family: string | null;
  method: string | null;
  glass: string | null;
  ice: string | null;
  garnish: string | null;
  instructions: string | null;
  ingredients: { label: string; amount: number | null; unit: string | null }[];
}

export interface RecipePhotoImportResponse {
  draft: ImportedRecipeDraft;
  unresolved: string[];
  image_hash: string;
}

export interface ProductTagRow {
  namespace: string;
  value: string;
}

export interface ProductLookupResult {
  suggested_id: string;
  name: string;
  category: string;
  subcategory: string | null;
  abv: number | null;
  distillery: string | null;
  origin_country: string | null;
  origin_region: string | null;
  age_statement_y: number | null;
  flavor_tags: string[];
  tags: ProductTagRow[];
  notes: string | null;
  confidence: "high" | "medium" | "low";
  rationale: string | null;
}

export interface ProductLookupEnvelope {
  ok: true;
  result: ProductLookupResult;
}

export interface Telemetry {
  now: number;
  readings_per_hour: number;
  pours_today: number;
  last_pour_at: number | null;
  last_pour_age_s: number | null;
  bottles_total: number;
  bottles_low: number;
  total_ml_on_hand: number;
  nodes_total: number;
  nodes_online: number;
  channels_total: number;
  channels_occupied: number;
  uptime_ms: number | null;
  uptime_days: number | null;
}

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
    categories?: { inserted: number; skipped: number };
    products: { inserted: number; skipped: number };
    bottles: { inserted: number; skipped: number };
    recipes: { inserted: number; skipped: number };
  };
}

export interface BulkImportCandidate {
  display_name: string;
  expression: string | null;
  fill_observed: "full" | "three-quarter" | "half" | "quarter" | "empty" | null;
  confidence: number;
  brand: string | null;
  distillery: string | null;
  category: string | null;
  size_ml: number | null;
  abv: number | null;
  origin_country: string | null;
  grounding_source: string | null;
  grounding_confidence: "high" | "medium" | "low" | null;
  grounding_rationale: string | null;
  image_index: number;
  image_id?: string;
  reconciliation: "existing-product" | "new-product";
  matched_product_id?: string;
}

export interface BulkImportPerImage {
  image_index: number;
  image_id?: string;
  status: "ok" | "failed";
  bottle_count?: number;
  detection_attempts?: number;
  error?: string;
}

export interface BulkImportResponse {
  candidates: BulkImportCandidate[];
  per_image: BulkImportPerImage[];
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

export interface FlagRow {
  key: string;
  label: string;
  description: string | null;
  default_enabled: boolean;
  enabled: boolean;
  updated_at: number | null;
}

export const api = {
  flags: () => req<FlagRow[]>("/flags"),
  patchFlag: (key: string, enabled: boolean) =>
    req<FlagRow>(`/flags/${encodeURIComponent(key)}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    }),
  categories: () => req<Category[]>("/categories"),
  createCategory: (body: { id: string; label: string; hue: number; sort_order?: number }) =>
    req<Category>("/categories", { method: "POST", body: JSON.stringify(body) }),
  patchCategory: (id: string, patch: Partial<Pick<Category, "label" | "hue" | "sort_order">>) =>
    req<Category>(`/categories/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteCategory: (id: string) =>
    req<unknown>(`/categories/${encodeURIComponent(id)}`, { method: "DELETE" }),
  products: () => req<Product[]>("/products"),
  bottles: () => req<BottleWithProduct[]>("/bottles"),
  bottleDetail: (id: string) => req<BottleDetail>(`/bottles/${encodeURIComponent(id)}/detail`),
  recipes: () => req<Recipe[]>("/recipes"),
  makeable: () => req<MakeableItem[]>("/makeable"),
  nodes: () => req<NodeWithChannels[]>("/nodes"),
  shopping: () => req<ShoppingList>("/shopping-list"),
  telemetry: () => req<Telemetry>("/telemetry"),
  pours: (params: { since?: number; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.since != null) q.set("since", String(params.since));
    if (params.limit != null) q.set("limit", String(params.limit));
    const qs = q.toString();
    return req<PourRow[]>(`/pours${qs ? `?${qs}` : ""}`);
  },
  poursSummary: (days = 28) => req<PourSummaryDay[]>(`/pours/summary?days=${days}`),
  poursTopRecipes: (days = 28) => req<TopRecipeRow[]>(`/pours/top-recipes?days=${days}`),
  poursTopBottles: (days = 28) => req<TopBottleRow[]>(`/pours/top-bottles?days=${days}`),
  pour: (body: { recipe_id: string; overrides?: { bottle_id: string; ml: number }[] }) =>
    req<unknown>("/pour", { method: "POST", body: JSON.stringify(body) }),
  pourCustom: (body: { bottle_id: string; ml: number }) =>
    req<{ id: string; recipe_id: string | null; bottles_used: { bottle_id: string; ml: number }[] }>(
      "/pour/custom",
      { method: "POST", body: JSON.stringify(body) },
    ),
  ideate: (body: { brief: string; mode?: "now" | "riff"; recipe_id?: string }) =>
    req<IdeateResponse>("/ai/ideate", { method: "POST", body: JSON.stringify(body) }),
  shoppingMuse: (preview = false) =>
    req<{ ranked: { product: Partial<Product> & { id: string }; unlocks: string[] }[]; preview?: unknown }>(
      `/ai/shopping${preview ? "?preview=1" : ""}`,
    ),
  createRecipe: (recipe: unknown) =>
    req<Recipe>("/recipes", { method: "POST", body: JSON.stringify(recipe) }),
  patchRecipe: (id: string, patch: unknown) =>
    req<Recipe>(`/recipes/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  createProduct: (product: unknown) =>
    req<Product>("/products", { method: "POST", body: JSON.stringify(product) }),
  patchProduct: (id: string, patch: unknown) =>
    req<Product>(`/products/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  getProduct: (id: string) =>
    req<Product & { tags: (ProductTagRow & { product_id: string })[] }>(
      `/products/${encodeURIComponent(id)}`,
    ),
  createBottle: (bottle: unknown) =>
    req<Bottle>("/bottles", { method: "POST", body: JSON.stringify(bottle) }),
  importRecipePhoto: (body: { image_b64: string; media_type: string }) =>
    req<RecipePhotoImportResponse>("/recipes/import-photo", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  importInventoryPhotoBulk: (body: { images: { image_b64: string; media_type: string; id?: string }[] }) =>
    req<BulkImportResponse>("/inventory/import-photo-bulk", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  lookupProduct: (body: { name: string; hint?: string }) =>
    req<ProductLookupEnvelope>("/ai/product-lookup", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  replaceProductTags: (id: string, tags: ProductTagRow[]) =>
    req<{ tags: (ProductTagRow & { product_id: string })[] }>(
      `/products/${encodeURIComponent(id)}/tags`,
      { method: "PUT", body: JSON.stringify({ tags }) },
    ),
  publishMenu: () => req<{ url: string; count: number }>("/menu/publish", { method: "POST" }),
  adminResetBar: () => req<AdminResetBarResponse>("/admin/reset/bar", { method: "POST" }),
  adminResetRecipes: () => req<AdminResetRecipesResponse>("/admin/reset/recipes", { method: "POST" }),
  adminReseed: () => req<AdminReseedResponse>("/admin/reseed", { method: "POST" }),

  // ── Calibration + tare ─────────────────────────────────────────────────
  channelSample: (deviceId: string, channel: number) =>
    req<RawSample>(`/nodes/${encodeURIComponent(deviceId)}/channels/${channel}/sample`),
  bottleSample: (id: string) =>
    req<BottleSample>(`/bottles/${encodeURIComponent(id)}/sample`),
  resetCalibration: (deviceId: string, channel: number) =>
    req<{ channel: CalibrateResponse["channel"]; mode: "identity" }>(
      `/nodes/${encodeURIComponent(deviceId)}/calibrate/reset`,
      { method: "POST", body: JSON.stringify({ channel }) },
    ),
  applyCalibration: (deviceId: string, body: CalibrateRequest) =>
    req<CalibrateResponse>(
      `/nodes/${encodeURIComponent(deviceId)}/calibrate`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  patchBottle: (id: string, body: Partial<Bottle>) =>
    req<unknown>(`/bottles/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
};
