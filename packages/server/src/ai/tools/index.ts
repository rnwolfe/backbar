/**
 * The AI mixology tool registry (specs/ai-grounding-plan.md §1).
 *
 * `buildTools(deps)` returns an AI-SDK tool map the agent can call mid-reasoning
 * to look up flavor knowledge and self-check its drafts. Each tool wraps pure
 * `@backbar/core` math + the seeded flavor corpus; the `description` is the
 * contract teaching the model when to reach for it.
 *
 * These are also the server's guardrail: the same resolve+check functions back
 * the authoritative re-validation after the loop (the model is never trusted).
 */
import { tool } from "ai";
import { z } from "zod";
import {
  FREEFORM_OK,
  Method,
  Unit,
  aggregateBalance,
  balanceFlags,
  classifyFamily,
  dilutionWaterMl,
  dominantTaste,
  finalAbv,
  finalVolumeMl,
  flavorSimilarity,
  pairingBlend,
  ratioForFamily,
  scoreFoodPairing,
  totalMl,
  type FlavorProfile,
} from "@backbar/core";
import { flavorPairings, flavorProfiles, ingredientSubstitutes, products } from "@backbar/db";
import type { Deps } from "../../deps";
import { buildRefSet } from "../prompts";
import { loadInventory } from "../../makeable";
import {
  resolveBalanceIngredients,
  resolveProfile,
  resolveRoles,
  resolveSpiritCategory,
  type ToolIngredient,
} from "./resolve";

const IngredientInput = z.object({
  ref: z.string().describe("Ingredient ref: a product slug, category id, or tag value."),
  amount: z.number().describe("Amount in the given unit."),
  unit: Unit.describe("Unit: ml | dash | barspoon | top | each | leaf."),
});

/** Dish taste intensities 0..1, constrained to the known taste keys. */
const TasteScores = z.object({
  sweet: z.number().min(0).max(1).optional(),
  sour: z.number().min(0).max(1).optional(),
  salt: z.number().min(0).max(1).optional(),
  bitter: z.number().min(0).max(1).optional(),
  umami: z.number().min(0).max(1).optional(),
  fat: z.number().min(0).max(1).optional(),
  spicy: z.number().min(0).max(1).optional(),
});

/** Human-readable rationale for a pairing's dominant basis. */
function pairingWhy(basis: string): string {
  switch (basis) {
    case "co-occurrence":
      return "appear together in classic cocktails";
    case "molecular":
      return "share aroma compounds (exploratory)";
    case "both":
      return "appear together in classics and share aromas";
    default:
      return "overlapping flavor profile";
  }
}

/** Compact volumetric ratio readout, e.g. "2 : 0.75 : 0.75". */
function ratioReadout(amounts: number[]): string {
  const vols = amounts.filter((a) => a > 0);
  if (!vols.length) return "";
  const base = Math.min(...vols);
  return vols.map((v) => Number((v / base).toFixed(2)).toString()).join(" : ");
}

/** Heuristic balance critique → issues + verdict. */
function balanceIssues(b: ReturnType<typeof aggregateBalance>, flags: ReturnType<typeof balanceFlags>): string[] {
  const issues: string[] = [];
  if (flags.too_hot) issues.push("too hot — final ABV above 30%; add dilution or lengthen");
  if (flags.too_watery) issues.push("too watery — final ABV below 8%; cut dilution or add spirit");
  if (b.sour > 0.5 && b.sweet < 0.25) issues.push("too tart — sour outruns sweet; add sweetener");
  if (b.sweet > 0.6 && b.sour < 0.2) issues.push("cloying — sweet with no acid to balance");
  if (b.bitter > 0.7 && b.sweet < 0.3) issues.push("aggressively bitter — little sweetness to round it");
  return issues;
}

export function buildTools(deps: Deps) {
  const profilesRepo = flavorProfiles(deps.db);
  const pairingsRepo = flavorPairings(deps.db);
  const subsRepo = ingredientSubstitutes(deps.db);

  /**
   * Refs currently in stock (product ids ∪ categories ∪ in-stock flavor_tags).
   * Memoized for the life of this per-request registry — multiple tools may
   * ask in one generation loop, and inventory is stable within a request.
   */
  let stockCache: Set<string> | null = null;
  const inStockRefs = (): Set<string> => {
    if (stockCache) return stockCache;
    const inv = loadInventory(deps.db);
    const set = buildRefSet(inv);
    for (const b of inv) {
      if (b.status === "empty" || b.status === "archived") continue;
      for (const t of b.product.flavor_tags ?? []) set.add(t);
    }
    stockCache = set;
    return set;
  };

  const descriptorSim = (a: string, b: string): number | null => {
    const pa = resolveProfile(deps, a);
    const pb = resolveProfile(deps, b);
    return pa && pb ? flavorSimilarity(pa, pb) : null;
  };

  return {
    flavor_profile: tool({
      description:
        "Look up what an ingredient tastes and smells like, how it contributes to each balance axis (sweet/sour/bitter/strong/aromatic), its typical ABV, intensity, and structural role. Use to reason about substitutions, pairings, and why a build works.",
      inputSchema: z.object({ ref: z.string() }),
      execute: async ({ ref }) => {
        const p = resolveProfile(deps, ref);
        return p ? { found: true, ...p } : { found: false, ref };
      },
    }),

    check_balance: tool({
      description:
        "Verify a draft is actually balanced and correctly strong. Resolves each ingredient's ABV and flavor axes, computes the real final ABV after method dilution, the 6 balance axes, and flags problems (too hot >30%, too watery <8%, too tart, cloying, over-bitter). Call before submitting; a `revise` verdict means fix the named issues, don't ship it.",
      inputSchema: z.object({ ingredients: z.array(IngredientInput).min(1), method: Method }),
      execute: async ({ ingredients, method }) => {
        const resolved = resolveBalanceIngredients(deps, ingredients as ToolIngredient[]);
        const balance = aggregateBalance(resolved, method);
        const abv = finalAbv(resolved, method);
        const flags = balanceFlags(resolved, method);
        const issues = balanceIssues(balance, flags);
        return {
          final_abv: Number(abv.toFixed(3)),
          balance,
          flags,
          ratio_readout: ratioReadout(resolved.map((i) => i.amount_ml)),
          verdict: issues.length ? "revise" : "ok",
          issues,
        };
      },
    }),

    compute_dilution: tool({
      description:
        "Compute chilling dilution and final strength/volume for a build using the method's calibrated dilution factor. Use to size a drink and confirm it lands in-glass at a sensible strength.",
      inputSchema: z.object({ ingredients: z.array(IngredientInput).min(1), method: Method }),
      execute: async ({ ingredients, method }) => {
        const resolved = resolveBalanceIngredients(deps, ingredients as ToolIngredient[]);
        return {
          pre_dilution_ml: Number(totalMl(resolved).toFixed(1)),
          water_ml: Number(dilutionWaterMl(resolved, method).toFixed(1)),
          final_volume_ml: Number(finalVolumeMl(resolved, method).toFixed(1)),
          final_abv: Number(finalAbv(resolved, method).toFixed(3)),
        };
      },
    }),

    classify_family: tool({
      description:
        "Identify which Cocktail-Codex root a build belongs to (old-fashioned/martini/daiquiri/sidecar/highball/flip) from its structure, and whether that matches the family you claim. Use to check a drink actually is the family you're calling it.",
      inputSchema: z.object({
        ingredients: z.array(IngredientInput).min(1),
        method: Method.optional(),
        claimed_family: z.string().optional(),
      }),
      execute: async ({ ingredients, method, claimed_family }) => {
        const roles = resolveRoles(deps, ingredients as ToolIngredient[]);
        const v = classifyFamily(roles, method);
        const matches =
          claimed_family == null ? null : claimed_family === v.family || claimed_family === v.root;
        return { ...v, claimed_family: claimed_family ?? null, matches };
      },
    }),

    suggest_ratio: tool({
      description:
        "Get the canonical starting ratio for a family or root (e.g. daiquiri/sour → 60:22:15). Use when proportioning a new build; adjust from here for syrup richness and citrus tartness.",
      inputSchema: z.object({ family: z.string() }),
      execute: async ({ family }) => {
        const t = ratioForFamily(family);
        return t
          ? { found: true, root: t.root, family: t.family, ratio: t.ratio, roles: t.roles, skeleton: t.skeleton }
          : { found: false, family };
      },
    }),

    shake_or_stir: tool({
      description:
        "Decide shake vs stir from the ingredients: citrus, egg/dairy, or juice → shake (aeration); all-spirit/clear → stir. Use to set or check the method.",
      inputSchema: z.object({ ingredients: z.array(IngredientInput).min(1) }),
      execute: async ({ ingredients }) => {
        const roles = resolveRoles(deps, ingredients as ToolIngredient[]).map((r) => r.role);
        const shake = roles.some((r) => r === "citrus" || r === "egg-dairy" || r === "juice");
        return {
          method: shake ? "shake" : "stir",
          reason: shake
            ? "contains citrus / egg / juice — shake to chill, dilute, and aerate"
            : "all-spirit / clear — stir for clarity and silky texture",
        };
      },
    }),

    pairing_score: tool({
      description:
        "Score how well two ingredients pair (0..1). Primary signal is how often they co-appear in real cocktails; descriptor overlap is secondary; a molecular shared-compound signal is included and labeled EXPLORATORY (weak/culturally biased — high co-occurrence is reliable, molecular-only is a creative gamble). Use to justify or vet a combination.",
      inputSchema: z.object({ a: z.string(), b: z.string() }),
      execute: async ({ a, b }) => {
        const edge = pairingsRepo.get(a, b);
        const descriptor = descriptorSim(a, b);
        const result = pairingBlend({
          cooccurrence: edge?.cooccurrence ?? null,
          descriptor,
          molecular: edge?.molecular ?? null,
        });
        const pa = resolveProfile(deps, a);
        const pb = resolveProfile(deps, b);
        const shared = pa && pb ? pa.descriptors.filter((d) => pb.descriptors.includes(d)) : [];
        return { score: Number(result.score.toFixed(3)), basis: result.basis, shared_descriptors: shared };
      },
    }),

    top_pairings: tool({
      description:
        "Find the best partners for an ingredient (ranked by co-occurrence, then descriptor overlap), optionally limited to in-stock items. Use to extend a build or find what bridges two ingredients.",
      inputSchema: z.object({
        ref: z.string(),
        n: z.number().int().min(1).max(20).optional(),
        in_stock_only: z.boolean().optional(),
      }),
      execute: async ({ ref, n = 6, in_stock_only = false }) => {
        const stock = in_stock_only ? inStockRefs() : null;
        const scored = pairingsRepo
          .forRef(ref)
          .map((e) => {
            const blend = pairingBlend({
              cooccurrence: e.cooccurrence,
              molecular: e.molecular,
              descriptor: descriptorSim(ref, e.partner),
            });
            return { ref: e.partner, score: blend.score, why: pairingWhy(blend.basis) };
          })
          .filter((p) => (stock ? stock.has(p.ref) : true))
          .sort((x, y) => y.score - x.score)
          .slice(0, n)
          .map((p) => ({ ...p, score: Number(p.score.toFixed(3)) }));
        return { ref, partners: scored };
      },
    }),

    flavor_similar: tool({
      description:
        "Find the closest flavor substitutes for an ingredient (curated swaps first, then computed profile overlap), optionally limited to in-stock items. Use for one-bottle-away swaps and riffs when the exact bottle isn't available.",
      inputSchema: z.object({ ref: z.string(), in_stock_only: z.boolean().optional() }),
      execute: async ({ ref, in_stock_only = false }) => {
        const stock = in_stock_only ? inStockRefs() : null;
        const target = resolveProfile(deps, ref);
        const curated = subsRepo.forRef(ref).map((s) => ({
          ref: s.substitute_ref,
          similarity: 1,
          why: s.note ?? "curated substitution",
        }));
        const curatedRefs = new Set(curated.map((c) => c.ref));
        const computed = target
          ? profilesRepo
              .list()
              .filter((p) => p.ref !== ref && p.role === target.role && !curatedRefs.has(p.ref))
              .map((p) => ({
                ref: p.ref,
                similarity: Number(flavorSimilarity(target, p).toFixed(3)),
                why: `same role (${p.role}), overlapping profile`,
              }))
              .filter((p) => p.similarity > 0.5)
              .sort((a, b) => b.similarity - a.similarity)
              .slice(0, 5)
          : [];
        const all = [...curated, ...computed].filter((p) => (stock ? stock.has(p.ref) : true));
        return { ref, alternatives: all };
      },
    }),

    check_makeable: tool({
      description:
        "Confirm every ingredient resolves to something in stock (a product, its category, an in-stock flavor tag, or a freeform pantry item). Inventory is non-negotiable — call before submitting; never propose a drink that isn't makeable.",
      inputSchema: z.object({ refs: z.array(z.string()).min(1) }),
      execute: async ({ refs }) => {
        const stock = inStockRefs();
        const missing = refs.filter((r) => !stock.has(r) && !FREEFORM_OK.has(r));
        return { makeable: missing.length === 0, missing };
      },
    }),

    score_food_pairing: tool({
      description:
        "Score a cocktail against a dish (0..1) on intensity match, taste interactions (acid cuts fat, sweet tames heat, bitter cuts richness…), shared aromas, and cuisine affinity. Provide the dish's features and the cocktail's ingredients; returns a score, the per-dimension breakdown, and a plain 'why'.",
      inputSchema: z.object({
        dish: z.object({
          intensity: z.number().min(0).max(1),
          tastes: TasteScores,
          cuisine: z.string().optional(),
          descriptors: z.array(z.string()).optional(),
        }),
        cocktail: z.object({ ingredients: z.array(IngredientInput).min(1), method: Method }),
      }),
      execute: async ({ dish, cocktail }) => {
        const resolved = resolveBalanceIngredients(deps, cocktail.ingredients as ToolIngredient[]);
        const axes = aggregateBalance(resolved, cocktail.method);
        const abv = finalAbv(resolved, cocktail.method);
        const profiles = cocktail.ingredients
          .map((i) => resolveProfile(deps, i.ref))
          .filter((p): p is FlavorProfile => p != null);
        const descriptors = Array.from(new Set(profiles.flatMap((p) => p.descriptors)));
        const baseSpirit = profiles.find((p) => p.role === "base-spirit");
        const intensity = Math.min(1, abv * 1.8 + axes.sweet * 0.3);
        return scoreFoodPairing(
          {
            intensity: dish.intensity,
            tastes: dish.tastes,
            cuisine: dish.cuisine,
            descriptors: dish.descriptors,
          },
          {
            intensity,
            taste: dominantTaste({ sweet: axes.sweet, sour: axes.sour, bitter: axes.bitter, strong: axes.strong, aromatic: axes.aromatic }),
            descriptors,
            baseSpirit: baseSpirit ? resolveSpiritCategory(deps, baseSpirit.ref) : undefined,
          },
        );
      },
    }),
  };
}

export type MixologyTools = ReturnType<typeof buildTools>;
