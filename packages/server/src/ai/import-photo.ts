import { createHash } from "node:crypto";
import { generateObject, type LanguageModel } from "ai";
import {
  Component,
  Recipe,
  type ComponentIngredient,
  type Component as ComponentT,
  type Product,
  type Recipe as RecipeT,
  type RecipeIngredient,
} from "@backbar/core";
import { getVisionModel } from "./gateway";
import { ImportedRecipe, type ImportedRecipeIngredient } from "./schema";

export type GenerateObjectFn = typeof generateObject;

export interface ImportPhotoInput {
  image_b64: string;
  media_type: string;
}

/** A homemade sub-recipe extracted from the image, as a draft Component plus
 *  whether one with the same id already exists (so the UI can show link-vs-new). */
export interface ImportedComponentDraft {
  draft: ComponentT;
  exists: boolean;
}

export interface ImportPhotoOk {
  ok: true;
  draft: RecipeT;
  unresolved: string[];
  /** Homemade components the drink depends on (orgeats/syrups). Empty for simple recipes. */
  components: ImportedComponentDraft[];
  /** sha256 of the (decoded) image bytes — recorded as provenance on save. */
  image_hash: string;
}
export interface ImportPhotoErr {
  ok: false;
  reason: "no-model" | "extract-failed";
  detail?: string;
}
export type ImportPhotoResult = ImportPhotoOk | ImportPhotoErr;

export interface ImportPhotoDeps {
  products: Product[];
  /** Existing shared components — used to flag link-vs-create on import. */
  components?: ComponentT[];
  model?: LanguageModel;
  generate?: GenerateObjectFn;
}

const SYSTEM =
  "Extract the cocktail recipe from this image. Preserve EXACT proportions, " +
  "units, and method — keep the unit the image shows (oz, ml, dash, barspoon, " +
  "tsp, tbsp, cup, drop, pinch). Do NOT convert oz to ml. Do NOT invent missing " +
  "fields; leave them null.\n" +
  "Per-ingredient qualifiers like 'fresh', 'freshly grated', or 'preferably " +
  "overproof' go in that ingredient's `note`, not its label.\n" +
  "CREDIT: capture the attribution printed with the recipe — `author` (the " +
  "creating bartender), `origin` (the bar / book / establishment, with city/" +
  "state if shown), and `notes` (the headnote or story paragraph). Leave any " +
  "that aren't present null; never invent them.\n" +
  "CRITICAL — homemade sub-recipes: many recipes include a made ingredient with " +
  "its OWN ingredient list and prep (e.g. an orgeat, syrup, infusion, cordial, " +
  "or tincture, often printed in a separate block). Put each such sub-recipe in " +
  "`components` (name, kind, its ingredients, instructions, and shelf life in " +
  "`keeps`). In the drink's main `ingredients`, still list that made ingredient " +
  "as one line with its pour amount, labeled to match the component's name — do " +
  "NOT flatten the sub-recipe's pantry items into the drink.";

/**
 * Recipe photo import (spec ai-engine.md §6).
 *
 * 1. Run vision via the AI Gateway, constrained to `ImportedRecipe` shape.
 * 2. Fuzzy-match each extracted ingredient label to an existing product
 *    (name / category contains). Matches become `ref_type:'product'`;
 *    misses stay `ref_type:'freeform'` with the original label.
 * 3. Hash the image once for provenance.
 *
 * Result is a draft for human confirmation — never auto-saved.
 */
export async function importPhoto(
  input: ImportPhotoInput,
  deps: ImportPhotoDeps,
): Promise<ImportPhotoResult> {
  const model = deps.model ?? getVisionModel();
  if (!model) return { ok: false, reason: "no-model" };

  const generate = deps.generate ?? generateObject;
  let extracted: ReturnType<typeof ImportedRecipe.parse>;
  try {
    const { object } = await generate({
      model,
      schema: ImportedRecipe,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", image: input.image_b64, mediaType: input.media_type },
            { type: "text", text: "Extract the recipe." },
          ],
        },
      ],
    });
    extracted = object as ReturnType<typeof ImportedRecipe.parse>;
  } catch (e) {
    return { ok: false, reason: "extract-failed", detail: (e as Error).message };
  }

  const image_hash = sha256Base64(input.image_b64);
  const provenance = `photo:${image_hash}`;
  const recipeId = slugify(extracted.name);

  // ── Components (homemade sub-recipes) ────────────────────────────────────
  // Build a draft per extracted component, keyed by a slug id. Existing shared
  // components with the same id are flagged so the UI shows link-vs-create; the
  // confirm step skips creating ones that already exist (slug = identity).
  const existingIds = new Set((deps.components ?? []).map((c) => c.id));
  const components: ImportedComponentDraft[] = [];
  // normalized component name → component id, for wiring the drink's build line.
  const componentByName = new Map<string, string>();
  for (const comp of extracted.components ?? []) {
    const compId = slugify(comp.name);
    componentByName.set(normalize(comp.name), compId);
    const compIngredients: ComponentIngredient[] = comp.ingredients.map((ci, i) => {
      // Component inputs are usually pantry items — try a product match, else freeform.
      const m = matchProduct(ci.label, deps.products);
      return {
        ref_type: m ? m.kind : "freeform",
        ref_id: m ? m.ref : null,
        label: ci.label,
        amount: ci.amount ?? null,
        unit: ci.unit ?? null,
        note: ci.note ?? null,
        sort: i,
      };
    });
    const draft = Component.parse({
      id: compId,
      name: comp.name,
      kind: comp.kind ?? null,
      instructions: comp.instructions ?? null,
      yield_ml: comp.yield_ml ?? null,
      keeps: comp.keeps ?? null,
      ingredients: compIngredients,
    });
    components.push({ draft, exists: existingIds.has(compId) });
  }

  const ingredients: RecipeIngredient[] = [];
  const unresolved: string[] = [];
  extracted.ingredients.forEach((ing, idx) => {
    const base = {
      label: ing.label,
      amount: ing.amount ?? null,
      unit: ing.unit ?? null,
      note: ing.note ?? null,
      optional: ing.optional ?? false,
      garnish: ing.garnish ?? false,
      sort: idx,
    };
    // A build line naming a homemade component → wire it to that component.
    const compId = componentByName.get(normalize(ing.label));
    if (compId) {
      ingredients.push({ ref_type: "component", ref_id: compId, ...base });
      return;
    }
    const match = matchProduct(ing.label, deps.products);
    if (match) {
      ingredients.push({ ref_type: match.kind, ref_id: match.ref, ...base });
    } else {
      ingredients.push({ ref_type: "freeform", ref_id: null, ...base });
      unresolved.push(ing.label);
    }
  });

  const draft = Recipe.parse({
    id: recipeId,
    name: extracted.name,
    family: extracted.family ?? null,
    method: extracted.method ?? null,
    glass: extracted.glass ?? null,
    ice: extracted.ice ?? null,
    garnish: extracted.garnish ?? null,
    instructions: extracted.instructions ?? null,
    source: "photo-import",
    provenance,
    author: extracted.author ?? null,
    origin: extracted.origin ?? null,
    notes: extracted.notes ?? null,
    is_published: false,
    tags: [],
    ingredients,
  });

  return { ok: true, draft, unresolved, components, image_hash };
}

interface ProductMatch {
  kind: "product" | "category";
  ref: string;
  score: number;
}

/**
 * Fuzzy label → product match. Strategy (best-first):
 *   1. Exact product name (case-insensitive).
 *   2. Product name token overlap (label contains ≥1 name word, ≥3 chars).
 *   3. Category name match (label === category or contains it).
 *   4. Flavor-tag exact match (label === tag).
 */
function matchProduct(label: string, products: Product[]): ProductMatch | null {
  const l = normalize(label);
  if (!l) return null;
  const tokens = tokenize(l);

  let best: ProductMatch | null = null;
  for (const p of products) {
    const name = normalize(p.name);
    const cat = normalize(p.category);
    const subcat = p.subcategory ? normalize(p.subcategory) : null;

    if (name && name === l) {
      return { kind: "product", ref: p.id, score: 100 };
    }
    if (name && (l.includes(name) || name.includes(l))) {
      const score = 80 - Math.abs(name.length - l.length);
      if (!best || score > best.score) best = { kind: "product", ref: p.id, score };
    }
    if (name) {
      const nameTokens = tokenize(name);
      const overlap = nameTokens.filter((t) => t.length >= 3 && tokens.includes(t)).length;
      if (overlap > 0) {
        const score = 50 + overlap * 5;
        if (!best || score > best.score) best = { kind: "product", ref: p.id, score };
      }
    }
    if (subcat && (l === subcat || l.includes(subcat))) {
      const score = 45;
      if (!best || score > best.score) best = { kind: "category", ref: p.category, score };
    }
    if (cat && (l === cat || l.includes(cat))) {
      const score = 40;
      if (!best || score > best.score) best = { kind: "category", ref: p.category, score };
    }
    for (const tag of p.flavor_tags) {
      const t = normalize(tag);
      if (t && t === l) {
        const score = 35;
        if (!best || score > best.score) best = { kind: "product", ref: p.id, score };
      }
    }
  }

  // Threshold: anything below 40 is too weak — let it fall through to unresolved.
  if (best && best.score >= 40) return best;
  return null;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics so á→a, ç→c (Mazapán, Cachaça)
    .replace(/[^a-z0-9\s-]/g, "")
    .trim();
}

function tokenize(s: string): string[] {
  return s.split(/[\s-]+/).filter(Boolean);
}

function slugify(s: string): string {
  return (
    normalize(s)
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || `imported-${Date.now()}`
  );
}

function sha256Base64(image_b64: string): string {
  // The provenance hash should reflect the underlying image bytes — base64
  // decode first so re-encoding doesn't shift the hash.
  let bytes: Buffer;
  try {
    bytes = Buffer.from(image_b64, "base64");
  } catch {
    bytes = Buffer.from(image_b64);
  }
  return createHash("sha256").update(bytes).digest("hex");
}
