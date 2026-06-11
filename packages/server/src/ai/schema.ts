import { z } from "zod";
import { Balance, Method, Unit } from "@backbar/core";

/**
 * AI structured output contract (spec ai-engine.md §2). The schema is the
 * boundary — `generateObject` is what enforces shape; this file just defines it.
 */
export const GeneratedSpec = z.object({
  name: z.string(),
  family: z.string(),
  method: Method,
  // Codex-style ratio string — e.g. "2 : 0.75 : 0.75" for a sour. Reads against
  // the FAMILY TEMPLATES the prompt grounds in, so a human can sanity-check the
  // shape at a glance without recomputing from `ingredients[].amount`.
  ratios: z.string(),
  glass: z.string(),
  ice: z.string(),
  garnish: z.string(),
  ingredients: z
    .array(
      z.object({
        product_ref: z.string(),
        ref_type: z.enum(["product", "category"]),
        amount: z.number().positive(),
        unit: z.enum(["ml", "dash", "barspoon", "top"]),
      }),
    )
    .min(2),
  predicted_balance: Balance,
  abv_estimate: z.number().min(0).max(1),
  rationale: z.string(),
  risk_note: z.string(),
});
export type GeneratedSpec = z.infer<typeof GeneratedSpec>;

export const IdeateRequest = z.object({
  brief: z.string().min(1),
  mode: z.enum(["now", "riff"]).default("now"),
  recipe_id: z.string().optional(),
  constraints: z
    .object({
      mustUse: z.array(z.string()).optional(),
      avoid: z.array(z.string()).optional(),
      glass: z.string().optional(),
      abvTarget: z.number().min(0).max(1).optional(),
      batch: z.number().int().positive().optional(),
    })
    .optional(),
});
export type IdeateRequest = z.infer<typeof IdeateRequest>;

export const PhotoImportRequest = z.object({
  image_b64: z.string().min(1),
  media_type: z.string().min(1),
});
export type PhotoImportRequest = z.infer<typeof PhotoImportRequest>;

/**
 * /ai/product-lookup — extract metadata for the Add Product modal so the
 * operator confirms+edits rather than typing everything from scratch.
 *
 * Schema mirrors the Product table's structured fields (specs/inventory-model.md §3a)
 * plus a `tags` array using the namespaced taxonomy (§3b). Every field is
 * nullable — the model returns what it knows and leaves the rest null so
 * the UI can grey-out missing values.
 */
export const ProductLookupRequest = z.object({
  name: z.string().min(1),
  /** Optional hint to disambiguate similarly-named products. */
  hint: z.string().optional(),
});
export type ProductLookupRequest = z.infer<typeof ProductLookupRequest>;

export const ProductLookupResult = z.object({
  /** Suggested slug — kebab-case, no overlap with existing catalog (UI confirms). */
  suggested_id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  subcategory: z.string().nullable(),
  abv: z.number().min(0).max(1).nullable(),
  distillery: z.string().nullable(),
  origin_country: z.string().length(2).nullable(),
  origin_region: z.string().nullable(),
  age_statement_y: z.number().positive().nullable(),
  flavor_tags: z.array(z.string()).default([]),
  tags: z
    .array(
      z.object({
        namespace: z.string().min(1),
        value: z.string().min(1),
      }),
    )
    .default([]),
  notes: z.string().nullable(),
  /** Model's own confidence + caveats; surfaced in the UI as a hint. */
  confidence: z.enum(["high", "medium", "low"]).default("medium"),
  rationale: z.string().nullable(),
});
export type ProductLookupResult = z.infer<typeof ProductLookupResult>;

/**
 * Vision-extracted bottle for bulk inventory import (spec ai-engine.md §7).
 *
 * Vision fields (filled by detection model from what is visible):
 *   display_name   — brand + expression text as read from the label
 *   expression     — specific version/expression (e.g. "12 Year"); null if not shown
 *   fill_observed  — coarse visual fill bucket; null if fill level is not visible
 *   confidence     — per-detection confidence 0–1
 *
 * Grounding placeholders (null here; filled by a subsequent grounding step):
 *   brand / distillery / category / size_ml / abv
 */
export const ExtractedBottle = z.object({
  display_name: z.string().min(1),
  expression: z.string().nullable(),
  fill_observed: z
    .enum(["full", "three-quarter", "half", "quarter", "empty"])
    .nullable(),
  confidence: z.number().min(0).max(1),
  brand: z.string().nullable().default(null),
  distillery: z.string().nullable().default(null),
  category: z.string().nullable().default(null),
  size_ml: z.number().positive().nullable().default(null),
  abv: z.number().min(0).max(1).nullable().default(null),
});
export type ExtractedBottle = z.infer<typeof ExtractedBottle>;

export const InventoryImportResult = z.object({
  bottles: z.array(ExtractedBottle),
});
export type InventoryImportResult = z.infer<typeof InventoryImportResult>;

/**
 * Vision-extracted recipe (spec ai-engine.md §6). Ingredients arrive as raw
 * labels — `import-photo.ts` then fuzzy-matches each label to an existing
 * product, returning the resolved recipe draft + unresolved labels.
 */
export const ImportedRecipeIngredient = z.object({
  label: z.string().min(1),
  amount: z.number().positive().nullable(),
  unit: Unit.nullable(),
  optional: z.boolean().nullable().optional(),
  garnish: z.boolean().nullable().optional(),
});
export type ImportedRecipeIngredient = z.infer<typeof ImportedRecipeIngredient>;

export const ImportedRecipe = z.object({
  name: z.string().min(1),
  family: z.string().nullable(),
  method: Method.nullable(),
  glass: z.string().nullable(),
  ice: z.string().nullable(),
  garnish: z.string().nullable(),
  instructions: z.string().nullable(),
  ingredients: z.array(ImportedRecipeIngredient).min(1),
});
export type ImportedRecipe = z.infer<typeof ImportedRecipe>;
