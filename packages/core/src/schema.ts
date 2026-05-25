import { z } from "zod";

// ─── primitive enums ──────────────────────────────────────────────────────
export const Source = z.enum(["manual", "weight", "pour"]);
export const Status = z.enum(["sealed", "open", "empty", "archived"]);
export const RefType = z.enum(["product", "category", "tag", "freeform"]);
export const Unit = z.enum(["ml", "dash", "barspoon", "each", "leaf", "top"]);
export const Method = z.enum(["build", "stir", "shake", "swizzle", "blend", "throw"]);
export const RecipeSource = z.enum(["book", "me", "ai", "photo-import"]);
export const NodeStatus = z.enum(["online", "offline"]);

export type Source = z.infer<typeof Source>;
export type Status = z.infer<typeof Status>;
export type RefType = z.infer<typeof RefType>;
export type Unit = z.infer<typeof Unit>;
export type Method = z.infer<typeof Method>;
export type RecipeSource = z.infer<typeof RecipeSource>;
export type NodeStatus = z.infer<typeof NodeStatus>;

// Catalog ids are slugs; events are UUIDv7 strings — keep both as a TEXT-shaped string.
const Slug = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "must be kebab-case slug");
const Id = z.string().min(1);

// ─── category (palette registry) ─────────────────────────────────────────
// Operators manage the category list from Settings. `product.category` is a
// free-text slug — this registry adds a display label + hue so the Console
// can render category swatches without a hardcoded TS palette.
export const Category = z.object({
  id: Slug,
  label: z.string().min(1),
  hue: z.number().int().min(0).max(360),
  sort_order: z.number().int().default(0),
  created_at: z.number().int(),
});
export type Category = z.infer<typeof Category>;

// ─── product ──────────────────────────────────────────────────────────────
// Structured-metadata fields per specs/inventory-model.md §3a. All nullish
// so existing rows + minimal Add Product forms still validate.
export const Product = z.object({
  id: Slug,
  name: z.string().min(1),
  category: z.string().min(1),
  subcategory: z.string().nullish(),
  abv: z.number().min(0).max(1).nullish(),
  density_g_ml: z.number().positive().nullish(),
  default_ml: z.number().int().positive().nullish(),
  flavor_tags: z.array(z.string()).default([]),
  notes: z.string().nullish(),
  distillery: z.string().nullish(),
  origin_country: z.string().length(2).nullish(), // ISO-3166-1 alpha-2
  origin_region: z.string().nullish(),
  producer_url: z.string().url().nullish(),
  age_statement_y: z.number().positive().nullish(),
});
export type Product = z.infer<typeof Product>;

// ─── product_tag ──────────────────────────────────────────────────────────
// Namespaced taxonomy per specs/inventory-model.md §3b. Recipe `ref_type:tag`
// matcher consults this table in addition to `product.flavor_tags`.
export const ProductTag = z.object({
  product_id: Slug,
  namespace: z.string().min(1), // smugglers-cove, cocktail-codex, flavor, operator, ...
  value: z.string().min(1),     // column-still-rum, old-fashioned-root, ...
});
export type ProductTag = z.infer<typeof ProductTag>;

// ─── bottle ───────────────────────────────────────────────────────────────
export const Bottle = z.object({
  id: Id,
  product_id: Slug,
  slot: z.string().nullish(),
  tare_g: z.number().nullish(),
  full_ml: z.number().int().positive(),
  level_ml: z.number().min(0),
  status: Status.default("open"),
  tracked: z.coerce.boolean().default(false),
  opened_at: z.number().int().nullish(),
  purchased_at: z.number().int().nullish(),
  price_cents: z.number().int().nullish(),
});
export type Bottle = z.infer<typeof Bottle>;

// ─── reading (append-only) ────────────────────────────────────────────────
export const Reading = z.object({
  id: Id,
  bottle_id: Id,
  level_ml: z.number().min(0),
  source: Source,
  confidence: z.number().min(0).max(1).default(1),
  raw: z.record(z.unknown()).nullish(),
  ts: z.number().int(),
});
export type Reading = z.infer<typeof Reading>;

// ─── balance axes ─────────────────────────────────────────────────────────
export const Balance = z.object({
  sweet: z.number().min(0).max(1),
  sour: z.number().min(0).max(1),
  bitter: z.number().min(0).max(1),
  strong: z.number().min(0).max(1),
  aromatic: z.number().min(0).max(1),
  dilution: z.number().min(0).max(1),
});
export type Balance = z.infer<typeof Balance>;

// ─── recipe + ingredient ──────────────────────────────────────────────────
export const RecipeIngredient = z.object({
  ref_type: RefType,
  ref_id: z.string().nullish(),
  label: z.string().nullish(),
  amount: z.number().positive().nullish(),
  unit: Unit.nullish(),
  optional: z.coerce.boolean().default(false),
  garnish: z.coerce.boolean().default(false),
  sort: z.number().int().default(0),
});
export type RecipeIngredient = z.infer<typeof RecipeIngredient>;

export const Recipe = z.object({
  id: Slug,
  name: z.string().min(1),
  family: z.string().nullish(),
  method: Method.nullish(),
  glass: z.string().nullish(),
  ice: z.string().nullish(),
  garnish: z.string().nullish(),
  instructions: z.string().nullish(),
  source: RecipeSource.nullish(),
  provenance: z.string().nullish(),
  abv_estimate: z.number().min(0).max(1).nullish(),
  balance: Balance.nullish(),
  is_published: z.coerce.boolean().default(false),
  tags: z.array(z.string()).default([]),
  ingredients: z.array(RecipeIngredient).default([]),
});
export type Recipe = z.infer<typeof Recipe>;

// ─── pour ────────────────────────────────────────────────────────────────
export const PourBinding = z.object({
  bottle_id: Id,
  ml: z.number().nonnegative(),
});
export type PourBinding = z.infer<typeof PourBinding>;

export const Pour = z.object({
  id: Id,
  recipe_id: Slug.nullish(),
  made_at: z.number().int(),
  bottles_used: z.array(PourBinding),
});
export type Pour = z.infer<typeof Pour>;

// ─── sensor_channel ──────────────────────────────────────────────────────
export const SensorChannel = z.object({
  device_id: z.string().min(1),
  channel: z.number().int().nonnegative(),
  slot: z.string().min(1),
  bottle_id: Id.nullish(),
  cal_slope: z.number().nullish(),
  cal_offset: z.number().nullish(),
});
export type SensorChannel = z.infer<typeof SensorChannel>;

// ─── node (fleet health) ─────────────────────────────────────────────────
export const Node = z.object({
  device_id: z.string().min(1),
  label: z.string().nullish(),
  last_seen: z.number().int().nullish(),
  status: NodeStatus.default("offline"),
  fw_version: z.string().nullish(),
});
export type Node = z.infer<typeof Node>;

// ─── ingest payloads (HTTP + MQTT both parse these) ──────────────────────
export const ManualReading = z.object({
  bottle_id: Id,
  level_ml: z.number().min(0),
});
export type ManualReading = z.infer<typeof ManualReading>;

export const WeightReading = z.object({
  device_id: z.string().min(1),
  channel: z.number().int().nonnegative(),
  raw_g: z.number(),
  ts: z.number().int(),
});
export type WeightReading = z.infer<typeof WeightReading>;
