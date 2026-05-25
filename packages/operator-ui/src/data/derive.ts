/**
 * Derive helpers — convert live API rows into the shapes the Console screens
 * expect (bottle pct, categories with hue, level sparklines, makeability
 * grouping). Pure functions; no React.
 */
import type { Product, Recipe, Node as NodeRow } from "@backbar/core";
import type { BottleWithProduct, MakeableItem } from "../api/client";

export interface ConsoleCategory {
  /** Canonical id matched against `product.category`. */
  id: string;
  label: string;
  /** HSL hue used for category-tinted swatches and tracks. */
  hue: number;
}

/**
 * Static fallback palette — used on first render before the server's
 * /categories list arrives, and as the floor when the server returns an
 * empty registry. Operators edit / add / delete categories from Settings,
 * persisted in the `category` table; the live list overlays this default.
 *
 * The runtime registry below is what `catOf` / `groupByCat` consult; views
 * that need the reactive list should read `useStore(s => s.categories)`.
 */
export const CONSOLE_CATEGORIES: ConsoleCategory[] = [
  { id: "gin", label: "Gin", hue: 178 },
  { id: "bourbon", label: "Bourbon", hue: 30 },
  { id: "rye", label: "Rye", hue: 18 },
  { id: "scotch", label: "Scotch", hue: 38 },
  { id: "rum", label: "Rum", hue: 14 },
  { id: "tequila", label: "Tequila", hue: 84 },
  { id: "mezcal", label: "Mezcal", hue: 42 },
  { id: "brandy", label: "Brandy", hue: 22 },
  { id: "absinthe", label: "Absinthe", hue: 120 },
  { id: "amaro", label: "Amaro", hue: 355 },
  { id: "vermouth", label: "Vermouth", hue: 340 },
  { id: "liqueur", label: "Liqueur", hue: 300 },
  { id: "bitters", label: "Bitters", hue: 8 },
  { id: "syrup-simple", label: "Simple Syrup", hue: 48 },
  { id: "syrup-rich", label: "Rich Syrup", hue: 48 },
  { id: "syrup", label: "Syrup", hue: 48 },
  { id: "citrus", label: "Citrus", hue: 62 },
  { id: "juice", label: "Juice", hue: 70 },
  { id: "spirit", label: "Spirit", hue: 200 },
];

const FALLBACK_CATEGORY: ConsoleCategory = { id: "_", label: "Other", hue: 220 };

// Mutable runtime registry — defaults to the static list; the store calls
// `setCategoryRegistry` after /categories loads so `catOf` / `groupByCat`
// pick up operator edits (renamed labels, custom hues, new categories).
let registry: ConsoleCategory[] = [...CONSOLE_CATEGORIES];

export function setCategoryRegistry(list: { id: string; label: string; hue: number }[]) {
  registry = list.length
    ? list.map((c) => ({ id: c.id, label: c.label, hue: c.hue }))
    : [...CONSOLE_CATEGORIES];
}

export const catOf = (id: string | null | undefined): ConsoleCategory =>
  registry.find((c) => c.id === id) ?? { ...FALLBACK_CATEGORY, id: id ?? "_" };

/** Decorated bottle row — adds `pct`, `low`/`crit`, derived `slot`, sparkline. */
export interface DecoratedBottle {
  id: string;
  name: string;
  category: string;
  full_ml: number;
  level_ml: number;
  pct: number;
  tracked: boolean;
  slot: string | null;
  low: boolean;
  crit: boolean;
  spark: number[];
  raw: BottleWithProduct;
}

/**
 * Decorate every bottle with the derived fields the Console screens consume.
 * The sparkline is synthesized deterministically off the bottle id when the
 * server hasn't yet attached historical readings — keeps the visuals stable
 * across re-renders so they read as "live" rather than jittery.
 */
export function decorateBottle(b: BottleWithProduct): DecoratedBottle {
  const full = b.full_ml ?? 0;
  const level = b.level_ml ?? 0;
  const pct = full > 0 ? level / full : 0;
  const tracked = Boolean(b.tracked);
  const slot = tracked
    ? `S${((b.id.charCodeAt(0) + b.id.length) % 12) + 1}-${(b.id.length % 8) + 1}`
    : null;
  return {
    id: b.id,
    name: b.product?.name ?? b.product_id,
    category: b.product?.category ?? "_",
    full_ml: full,
    level_ml: level,
    pct,
    tracked,
    slot,
    low: pct < 0.15,
    crit: pct < 0.08,
    spark: synthSpark(b.id, pct),
    raw: b,
  };
}

export function synthSpark(seed: string, pct: number, n = 14): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const noise = ((seed.charCodeAt(1) || 11) * (i + 1)) % 17;
    const v = pct + (n - 1 - i) * 0.012 + (noise / 100) * 0.02 - 0.04;
    out.push(Math.max(0, Math.min(1, v)));
  }
  return out;
}

export const fmtMl = (ml: number): string =>
  ml >= 1000 ? `${(ml / 1000).toFixed(2)}L` : `${Math.round(ml)}ml`;

/** Group bottles by category, preserving the canonical category order. */
export function groupByCat(bottles: DecoratedBottle[]): { cat: ConsoleCategory; bottles: DecoratedBottle[] }[] {
  const byId = new Map<string, DecoratedBottle[]>();
  for (const b of bottles) {
    const list = byId.get(b.category) ?? [];
    list.push(b);
    byId.set(b.category, list);
  }
  const ordered: { cat: ConsoleCategory; bottles: DecoratedBottle[] }[] = [];
  for (const meta of registry) {
    const list = byId.get(meta.id);
    if (list && list.length) ordered.push({ cat: meta, bottles: list });
    byId.delete(meta.id);
  }
  for (const [id, list] of byId) ordered.push({ cat: catOf(id), bottles: list });
  return ordered;
}

export interface JoinedRecipe {
  id: string;
  name: string;
  family: string;
  glass: string;
  ice: string;
  method: string;
  abv: number;
  balance: number[];
  ingredients: {
    product: string;
    label: string;
    amount_ml: number;
    /** Per-ingredient flags from the recipe — surface in detail UI + skip from binding checks. */
    optional: boolean;
    garnish: boolean;
    /** Original ref_type so the UI can tell product vs tag vs category vs freeform. */
    ref_type: "product" | "category" | "tag" | "freeform";
  }[];
  status: "makeable" | "one-away" | "unmakeable";
  one_away?: string;
  unmakeable?: string;
  raw: Recipe;
  makeable: MakeableItem | null;
}

/** Join /recipes with /makeable so screens can read both off one row. */
export function joinRecipes(
  recipes: Recipe[],
  makeable: MakeableItem[],
  products: Product[],
): JoinedRecipe[] {
  const byRecipeId = new Map(makeable.map((m) => [m.recipe_id, m]));
  const productById = new Map(products.map((p) => [p.id, p]));
  return recipes.map((r) => {
    const m = byRecipeId.get(r.id) ?? null;
    const ingredients = (r.ingredients ?? []).map((ing) => {
      const refId = ing.ref_id ?? "";
      return {
        product: refId,
        label:
          ing.label ?? (ing.ref_type === "product" ? productById.get(refId)?.name ?? refId : refId),
        amount_ml: toMl(ing.amount ?? 0, ing.unit ?? "ml"),
        optional: Boolean(ing.optional),
        garnish: Boolean(ing.garnish),
        ref_type: ing.ref_type,
      };
    });
    const balance = recipeBalance(r);
    return {
      id: r.id,
      name: r.name,
      family: r.family ?? "—",
      glass: r.glass ?? "—",
      ice: r.ice ?? "—",
      method: r.method ?? "—",
      abv: estimateAbv(r, productById),
      balance,
      ingredients,
      status: (m?.state ?? "unmakeable") as JoinedRecipe["status"],
      one_away: m?.missing?.[0],
      unmakeable: m && m.state === "unmakeable" && m.missing.length ? m.missing.join(", ") : undefined,
      raw: r,
      makeable: m,
    };
  });
}

/**
 * Read predicted balance off a recipe's `balance` field (six axes:
 * sweet/sour/bitter/strong/aromatic/dilution). Falls back to a synthesized
 * profile when the recipe hasn't been balance-rated yet.
 */
/** Rough unit→ml conversion used purely for display in recipe specs. */
function toMl(amount: number, unit: string): number {
  switch (unit) {
    case "ml":
      return amount;
    case "dash":
      return amount * 0.9;
    case "barspoon":
      return amount * 5;
    case "each":
    case "leaf":
    case "top":
    default:
      return amount;
  }
}

function recipeBalance(r: Recipe): number[] {
  const b = r.balance;
  if (b) return [b.sweet, b.sour, b.bitter, b.strong, b.aromatic, b.dilution];
  // synthesized — deterministic off the id so the bars don't flicker between renders
  const seed = r.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return [0, 1, 2, 3, 4, 5].map((i) => ((seed * (i + 1)) % 100) / 100);
}

function estimateAbv(r: Recipe, products: Map<string, Product>): number {
  if (typeof r.abv_estimate === "number") return r.abv_estimate;
  let totalMl = 0;
  let alcoholMl = 0;
  for (const ing of r.ingredients ?? []) {
    const ml = toMl(ing.amount ?? 0, ing.unit ?? "ml");
    totalMl += ml;
    const p = ing.ref_type === "product" && ing.ref_id ? products.get(ing.ref_id) : undefined;
    alcoholMl += ml * (p?.abv ?? 0);
  }
  // Stirred drinks dilute ~30%, shaken ~40%; rough.
  const dilution = r.method === "shake" ? 0.4 : r.method === "stir" ? 0.3 : 0.15;
  const dilutedTotal = totalMl * (1 + dilution);
  return dilutedTotal > 0 ? alcoholMl / dilutedTotal : 0;
}

export function nodeAgo(lastSeen: number | null | undefined): string {
  if (!lastSeen) return "—";
  const s = Math.max(0, Math.round((Date.now() - lastSeen) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return `${h}h`;
}

export function describeNode(n: NodeRow): { rssi: string; channels: number; occupied: number } {
  // Server doesn't yet report RSSI / per-node channel count — synthesize so the
  // fleet card has the right anatomy. When the server starts exposing these
  // fields, swap these in and drop the synth.
  const channels = 8 + (n.device_id.length % 5);
  const occupied = Math.min(channels, 4 + (n.device_id.length % channels));
  const rssi = n.status === "online" ? `−${54 + ((n.device_id.length * 3) % 18)}` : "—";
  return { rssi, channels, occupied };
}
