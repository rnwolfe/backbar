import { z } from "zod";
import { Balance, Method } from "@backbar/core";

/**
 * AI structured output contract (spec ai-engine.md §2). The schema is the
 * boundary — `generateObject` is what enforces shape; this file just defines it.
 */
export const GeneratedSpec = z.object({
  name: z.string(),
  family: z.string(),
  method: Method,
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
