/**
 * Flavor-grounding domain: the pure types, framework constants, and functions
 * the AI mixology tools call. IO-free — callers resolve refs to profiles and
 * pass data in (see specs/ai-grounding-plan.md, specs/ai-grounding-corpus.md).
 *
 * Three layers live here:
 *   1. Types/zod for the authored corpus (FlavorProfile, RootTemplate, …).
 *   2. Framework constants that are *facts* (Cocktail-Codex roots, taste
 *      interactions, cuisine affinity) — small enough to be canonical here,
 *      mirrored into DB tables for query.
 *   3. Pure scoring/classification used by the tools and the server guardrail.
 */
import { z } from "zod";
import type { Balance, Method } from "./schema";
import { RefType } from "./schema";

// ─── flavor axes + profiles ────────────────────────────────────────────────

/** The five per-ingredient contribution axes (dilution is method-driven, not
 *  an ingredient property — it lives on the full `Balance`). */
export const FLAVOR_AXES = ["sweet", "sour", "bitter", "strong", "aromatic"] as const;
export type FlavorAxis = (typeof FLAVOR_AXES)[number];

export const FlavorAxesSchema = z.object({
  sweet: z.number().min(0).max(1),
  sour: z.number().min(0).max(1),
  bitter: z.number().min(0).max(1),
  strong: z.number().min(0).max(1),
  aromatic: z.number().min(0).max(1),
});
export type FlavorAxes = z.infer<typeof FlavorAxesSchema>;

/** Structural role an ingredient plays — drives family classification. */
export const IngredientRole = z.enum([
  "base-spirit", // gin, whiskey, rum, tequila, brandy…
  "aromatized-wine", // vermouth, sherry, lillet
  "amaro-bitter", // Campari, Aperol, Fernet (bittering modifier)
  "liqueur-sweet", // Cointreau, maraschino, orange curaçao
  "syrup-sweet", // simple, rich, orgeat, honey
  "citrus", // lime/lemon/grapefruit juice
  "juice", // pineapple, cranberry, non-citrus juice
  "bitters", // Angostura, Peychaud's (dashes)
  "egg-dairy", // egg white/yolk, cream
  "carbonation", // soda, tonic, sparkling lengthener
  "aromatic", // absinthe rinse, aromatic accents
  "garnish", // peel, cherry, mint
  "other",
]);
export type IngredientRole = z.infer<typeof IngredientRole>;

export const FlavorProfile = z.object({
  /** Our ref id (product slug, category, or tag value). */
  ref: z.string(),
  ref_type: RefType,
  /** Human/agent-readable flavor & aroma descriptors (our own wording). */
  descriptors: z.array(z.string()),
  /** 0..1 contribution per axis, volume-weighted when aggregated. */
  axes: FlavorAxesSchema,
  /** Default ABV 0..1 for this ingredient (overridden by a real product abv). */
  typical_abv: z.number().min(0).max(1),
  /** Overall flavor punch 0..1 — used for intensity matching in pairings. */
  intensity: z.number().min(0).max(1),
  role: IngredientRole,
  notes: z.string().optional(),
});
export type FlavorProfile = z.infer<typeof FlavorProfile>;

/** A directed flavor substitution (corpus E). */
export const IngredientSubstitute = z.object({
  ref: z.string(),
  substitute_ref: z.string(),
  note: z.string().optional(),
});
export type IngredientSubstitute = z.infer<typeof IngredientSubstitute>;

/** A pairing edge between two refs (corpus B/C). Any signal may be null. */
export const PairingEdge = z.object({
  a: z.string(),
  b: z.string(),
  cooccurrence: z.number().min(0).max(1).nullable(),
  molecular: z.number().min(0).max(1).nullable(),
});
export type PairingEdge = z.infer<typeof PairingEdge>;

/** Project a profile + poured volume into a `BalanceIngredient` (balance.ts). */
export function profileToBalanceIngredient(
  profile: Pick<FlavorProfile, "axes" | "typical_abv">,
  amount_ml: number,
  abvOverride?: number | null,
): { amount_ml: number; abv: number; axes: Partial<Balance> } {
  return {
    amount_ml,
    abv: abvOverride ?? profile.typical_abv,
    axes: { ...profile.axes },
  };
}

// ─── flavor similarity (substitution) ──────────────────────────────────────

const AXIS_KEYS = FLAVOR_AXES;

function axesCosine(a: FlavorAxes, b: FlavorAxes): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const k of AXIS_KEYS) {
    dot += a[k] * b[k];
    na += a[k] * a[k];
    nb += b[k] * b[k];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function jaccard(a: readonly string[], b: readonly string[]): number {
  if (!a.length && !b.length) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter += 1;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Flavor closeness 0..1 of two profiles — blends axis cosine (60%) and
 * descriptor Jaccard (40%). Same role is a prerequisite for a *substitution*
 * (caller filters); here we just measure profile overlap.
 */
export function flavorSimilarity(a: FlavorProfile, b: FlavorProfile): number {
  return 0.6 * axesCosine(a.axes, b.axes) + 0.4 * jaccard(a.descriptors, b.descriptors);
}

// ─── pairing blend ─────────────────────────────────────────────────────────

export type PairingBasis = "co-occurrence" | "molecular" | "descriptor" | "both";

export interface PairingResult {
  score: number; // 0..1
  basis: PairingBasis;
}

/**
 * Blend the pairing signals into one score. Co-occurrence (how often two
 * ingredients appear together in real cocktails) is the trustworthy primary
 * signal; descriptor overlap is the secondary; molecular shared-compound
 * overlap is an *exploratory* tie-breaker (weak/culturally biased — see
 * spike §2). Any signal may be absent (pass null).
 */
export function pairingBlend(signals: {
  cooccurrence?: number | null;
  descriptor?: number | null;
  molecular?: number | null;
}): PairingResult {
  const co = clamp01(signals.cooccurrence);
  const de = clamp01(signals.descriptor);
  const mo = clamp01(signals.molecular);
  // Weighted blend with renormalization over present signals.
  const parts: Array<[number, number]> = [];
  if (signals.cooccurrence != null) parts.push([0.6, co]);
  if (signals.descriptor != null) parts.push([0.3, de]);
  if (signals.molecular != null) parts.push([0.1, mo]);
  if (!parts.length) return { score: 0, basis: "descriptor" };
  const wsum = parts.reduce((s, [w]) => s + w, 0);
  const score = parts.reduce((s, [w, v]) => s + (w / wsum) * v, 0);

  // `basis` reports which signals contributed: a single name when only one is
  // present, otherwise "both" (i.e. more than one signal informed the score).
  const present: PairingBasis[] = [];
  if (signals.cooccurrence != null) present.push("co-occurrence");
  if (signals.molecular != null) present.push("molecular");
  if (signals.descriptor != null) present.push("descriptor");
  const basis: PairingBasis = present.length > 1 ? "both" : (present[0] ?? "descriptor");
  return { score: clamp01(score), basis };
}

// ─── cocktail-codex root templates (framework facts) ───────────────────────

export interface RootTemplate {
  /** Codex root id. */
  root: string;
  /** Our recipe-family label this root maps to. */
  family: string;
  /** Plain-language skeleton. */
  skeleton: string;
  /** Typical method. */
  method: Method;
  /** Canonical starting ratio (parts, in declared role order). */
  ratio: number[];
  /** Roles, in ratio order, that define the skeleton. */
  roles: IngredientRole[];
  derived: string[];
}

/** The six roots every cocktail descends from (Cocktail Codex framework). */
export const ROOT_TEMPLATES: readonly RootTemplate[] = [
  {
    root: "old-fashioned",
    family: "old-fashioned",
    skeleton: "spirit + sugar + bitters",
    method: "build",
    ratio: [60, 5, 2],
    roles: ["base-spirit", "syrup-sweet", "bitters"],
    derived: ["sazerac", "improved-whiskey", "oaxaca-old-fashioned"],
  },
  {
    root: "martini",
    family: "spirit-forward",
    skeleton: "spirit + aromatized wine (stirred, all-booze)",
    method: "stir",
    ratio: [60, 30],
    roles: ["base-spirit", "aromatized-wine"],
    derived: ["manhattan", "negroni", "martinez", "vesper"],
  },
  {
    root: "daiquiri",
    family: "sour",
    skeleton: "spirit + citrus + syrup sweetener (shaken)",
    method: "shake",
    ratio: [60, 22, 15],
    roles: ["base-spirit", "citrus", "syrup-sweet"],
    derived: ["gimlet", "whiskey-sour", "margarita-ish", "bees-knees"],
  },
  {
    root: "sidecar",
    family: "sour",
    skeleton: "spirit + citrus + liqueur sweetener (shaken)",
    method: "shake",
    ratio: [45, 22, 22],
    roles: ["base-spirit", "citrus", "liqueur-sweet"],
    derived: ["margarita", "cosmopolitan", "last-word", "white-lady"],
  },
  {
    root: "highball",
    family: "highball",
    skeleton: "spirit + carbonated lengthener (built, tall)",
    method: "build",
    ratio: [45, 120],
    roles: ["base-spirit", "carbonation"],
    derived: ["gin-tonic", "mojito", "paloma", "spritz"],
  },
  {
    root: "flip",
    family: "flip",
    skeleton: "spirit + sugar + whole egg / dairy / richness (shaken hard)",
    method: "shake",
    ratio: [45, 15],
    roles: ["base-spirit", "egg-dairy"],
    derived: ["alexander", "fizz", "egg-nog"],
  },
] as const;

export interface FamilyVerdict {
  root: string;
  family: string;
  confidence: number; // 0..1
  why: string;
}

/**
 * Classify a build into a Codex root from the roles present + method.
 * Discriminators (in priority order): egg/dairy → flip; carbonation →
 * highball; citrus + liqueur-sweet → sidecar; citrus + syrup-sweet → daiquiri;
 * aromatized-wine, no citrus → martini; sugar + bitters, no citrus →
 * old-fashioned. Returns best match + a confidence.
 */
export function classifyFamily(
  ingredients: { role: IngredientRole }[],
  method?: Method,
): FamilyVerdict {
  const roles = new Set(ingredients.map((i) => i.role));
  const has = (r: IngredientRole) => roles.has(r);
  const t = (root: string) => ROOT_TEMPLATES.find((x) => x.root === root)!;

  if (has("egg-dairy")) return verdict(t("flip"), 0.9, "whole egg / dairy / richness present");
  if (has("carbonation")) return verdict(t("highball"), 0.9, "carbonated lengthener present");
  if (has("citrus") && has("liqueur-sweet"))
    return verdict(t("sidecar"), 0.85, "citrus balanced by a liqueur sweetener");
  if (has("citrus") && (has("syrup-sweet") || method === "shake"))
    return verdict(t("daiquiri"), 0.85, "citrus balanced by a syrup sweetener (shaken sour)");
  if (has("aromatized-wine") && !has("citrus"))
    return verdict(t("martini"), 0.8, "spirit + aromatized wine, no citrus (stirred)");
  if ((has("syrup-sweet") || has("liqueur-sweet")) && has("bitters") && !has("citrus"))
    return verdict(t("old-fashioned"), 0.8, "spirit + sugar + bitters, no citrus");
  if (has("amaro-bitter") && has("aromatized-wine"))
    return verdict(t("martini"), 0.65, "bitter + aromatized wine — Negroni branch of the Martini root");
  // Fallback: spirit-forward if no citrus, else sour.
  return has("citrus")
    ? verdict(t("daiquiri"), 0.4, "citrus present but ambiguous sweetener — defaulting to the sour root")
    : verdict(t("martini"), 0.4, "all-spirit but ambiguous — defaulting to the spirit-forward root");
}

function verdict(t: RootTemplate, confidence: number, why: string): FamilyVerdict {
  return { root: t.root, family: t.family, confidence, why };
}

/** Canonical starting ratio for a family/root (matches by root or family). */
export function ratioForFamily(familyOrRoot: string): RootTemplate | null {
  return (
    ROOT_TEMPLATES.find((t) => t.root === familyOrRoot) ??
    ROOT_TEMPLATES.find((t) => t.family === familyOrRoot) ??
    null
  );
}

// ─── acid math (facts; Dave Arnold) ────────────────────────────────────────
//
// Chilling dilution is sourced from `balance.ts` METHOD_DILUTION (the project's
// calibrated per-method factor) — not an ABV regression, which models a
// different quantity (neat-spirit-to-finished-drink) and disagrees with our
// per-ml factor. An ABV-dependent refinement is a future corpus item.

/** Grams of acid to bring `mass_g` of juice from `current` to `target`
 *  titratable acidity (as %). Split citric:malic 2:1 (lime-like). */
export function acidToAdd(
  mass_g: number,
  currentAcidityPct: number,
  targetAcidityPct: number,
): { total_g: number; citric_g: number; malic_g: number } {
  const delta = Math.max(0, (targetAcidityPct - currentAcidityPct) / 100) * mass_g;
  return { total_g: round2(delta), citric_g: round2(delta * (2 / 3)), malic_g: round2(delta * (1 / 3)) };
}

// ─── food ↔ cocktail pairing (framework facts + scorer) ────────────────────

export const TASTES = ["sweet", "sour", "salt", "bitter", "umami", "fat", "spicy"] as const;
export type Taste = (typeof TASTES)[number];

/**
 * How a cocktail's dominant taste interacts with a dish taste. +1 synergy,
 * −1 clash. Encodes well-established rules: acid cuts fat, sweet tames heat &
 * bitterness, bitter cuts richness, salt lifts and suppresses bitterness,
 * umami clashes with bitterness. Keyed [drinkTaste][dishTaste].
 */
export const TASTE_INTERACTIONS: Record<Taste, Partial<Record<Taste, number>>> = {
  sour: { fat: 1, salt: 0.5, sweet: 0.3, spicy: 0.4, umami: 0.3 },
  sweet: { spicy: 1, bitter: 0.6, salt: 0.5, sour: 0.3, fat: 0.2 },
  bitter: { fat: 0.8, sweet: 0.4, umami: -0.6, salt: 0.3, bitter: -0.3 },
  salt: { bitter: 0.6, sweet: 0.3, fat: 0.3, umami: 0.2 },
  umami: { umami: -0.4, bitter: -0.5, salt: 0.4, fat: 0.3 },
  fat: { sour: 0.6, bitter: 0.4, salt: 0.2 },
  spicy: { sweet: 0.8, sour: 0.3, fat: -0.2 },
};

/** Cuisine → base-spirit affinity ("what grows together"). 0..1. */
export const CUISINE_AFFINITY: Record<string, Partial<Record<string, number>>> = {
  mexican: { tequila: 1, mezcal: 0.9, rum: 0.4 },
  caribbean: { rum: 1, tequila: 0.4 },
  tropical: { rum: 1, tequila: 0.5, gin: 0.3 },
  italian: { amaro: 1, gin: 0.6, brandy: 0.5, vermouth: 0.8 },
  french: { brandy: 1, gin: 0.6, vermouth: 0.6 },
  japanese: { gin: 0.7, scotch: 0.6, rye: 0.4 },
  american: { bourbon: 1, rye: 1, gin: 0.6 },
  bbq: { bourbon: 1, rye: 0.9, mezcal: 0.7 },
  seafood: { gin: 0.9, tequila: 0.7, vodka: 0.6 },
  dessert: { brandy: 0.8, bourbon: 0.7, amaro: 0.7, rum: 0.7 },
};

export interface DishFeatures {
  /** 0..1 weight/richness of the dish. */
  intensity: number;
  /** Dominant tastes present, 0..1. */
  tastes: Partial<Record<Taste, number>>;
  cuisine?: string;
  /** Optional aroma descriptors for the bridge term. */
  descriptors?: string[];
}

export interface CocktailFeatures {
  intensity: number; // 0..1 (≈ f(abv, sweetness, richness))
  /** Dominant taste of the drink, mapped from balance axes. */
  taste: Taste;
  descriptors: string[];
  baseSpirit?: string; // category id, for cuisine affinity
}

export interface FoodPairingScore {
  score: number; // 0..1
  dimensions: {
    intensity: number;
    taste: number;
    aroma: number;
    cuisine: number;
  };
  why: string;
}

/**
 * Score a cocktail against a dish over four dimensions: intensity match,
 * taste interaction, aroma bridge (shared descriptors), and cuisine affinity.
 * Pure — caller supplies parsed features. Weights are tunable.
 */
export function scoreFoodPairing(dish: DishFeatures, drink: CocktailFeatures): FoodPairingScore {
  const intensity = 1 - Math.abs(dish.intensity - drink.intensity);

  let taste = 0;
  const row = TASTE_INTERACTIONS[drink.taste] ?? {};
  for (const [k, v] of Object.entries(dish.tastes)) {
    taste += (row[k as Taste] ?? 0) * clamp01(v);
  }
  taste = clampNeg1to1(taste);
  const tasteNorm = (taste + 1) / 2; // → 0..1

  const aroma = jaccard(dish.descriptors ?? [], drink.descriptors);

  const cuisine =
    dish.cuisine && drink.baseSpirit
      ? clamp01(CUISINE_AFFINITY[dish.cuisine.toLowerCase()]?.[drink.baseSpirit] ?? 0)
      : 0;

  const W = { intensity: 0.35, taste: 0.35, aroma: 0.2, cuisine: 0.1 };
  const score = clamp01(
    W.intensity * intensity + W.taste * tasteNorm + W.aroma * aroma + W.cuisine * cuisine,
  );

  const reasons: string[] = [];
  if (intensity > 0.75) reasons.push("weights match");
  else if (intensity < 0.4) reasons.push("weight mismatch (one will bury the other)");
  if (taste > 0.3) reasons.push(`${drink.taste} works with the dish`);
  else if (taste < -0.2) reasons.push(`${drink.taste} clashes with the dish`);
  if (aroma > 0.2) reasons.push("shared aromas bridge them");
  if (cuisine > 0.5) reasons.push("regional affinity");

  return {
    score,
    dimensions: { intensity, taste: tasteNorm, aroma, cuisine },
    why: reasons.join("; ") || "neutral pairing",
  };
}

/** Map a 5-axis balance to the drink's dominant pairing taste. */
export function dominantTaste(axes: FlavorAxes): Taste {
  const entries: Array<[Taste, number]> = [
    ["sour", axes.sour],
    ["sweet", axes.sweet],
    ["bitter", axes.bitter],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0]![1] > 0.15 ? entries[0]![0] : "bitter";
}

// ─── small numeric helpers ─────────────────────────────────────────────────

function clamp01(n: number | null | undefined): number {
  if (n == null || !Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
function clampNeg1to1(n: number): number {
  return n < -1 ? -1 : n > 1 ? 1 : n;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
