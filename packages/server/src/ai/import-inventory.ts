import { generateObject, type LanguageModel } from "ai";
import { getInventoryImportModel } from "./gateway";
import { type ExtractedBottle, InventoryImportResult } from "./schema";

export type GenerateObjectFn = typeof generateObject;

export interface ImportInventoryInput {
  image_b64: string;
  media_type: string;
}

export interface ImportInventoryOk {
  ok: true;
  bottles: ExtractedBottle[];
  attempts: number;
}
export interface ImportInventoryErr {
  ok: false;
  reason: "no-model" | "extract-failed";
  detail?: string;
}
export type ImportInventoryResult = ImportInventoryOk | ImportInventoryErr;

export interface ImportInventoryDeps {
  model?: LanguageModel;
  generate?: GenerateObjectFn;
}

const SYSTEM =
  "You are cataloging spirit bottles visible in a bar photograph for home-bar inventory management.\n\n" +
  "For EVERY distinct bottle visible, return one entry with:\n" +
  "  display_name  — the full brand and expression text exactly as printed on the label " +
  "(e.g. 'Maker's Mark Bourbon Whisky'). Be as specific as the label allows.\n" +
  "  expression    — the specific version or expression (e.g. '12 Year', 'Cask Strength', " +
  "'Single Barrel'); null if no distinct expression is shown.\n" +
  "  fill_observed — coarse visual fill: 'full', 'three-quarter', 'half', 'quarter', or 'empty'; " +
  "null if the fill level is not clearly visible.\n" +
  "  confidence    — your identification confidence 0–1 based on label legibility.\n\n" +
  "Leave brand, distillery, category, size_ml, and abv null — do NOT guess or infer them. " +
  "Those fields are resolved in a separate authoritative grounding step. " +
  "Report only what is directly readable from the image. " +
  "Include partially visible bottles when the label is legible enough to identify.";

/**
 * Bulk inventory import from a bar photo (spec ai-engine.md §7).
 *
 * Calls the vision model once per image and returns one `ExtractedBottle` per
 * distinct bottle detected. Grounding placeholders (brand/distillery/category/
 * size_ml/abv) are left null — the caller fills them via a grounding step.
 *
 * On parse/generation failure, re-prompts once with error context (same
 * pattern as `ideate.ts`). After two failed attempts returns
 * `{ ok: false, reason: 'extract-failed' }` rather than throwing.
 */
export async function importInventory(
  input: ImportInventoryInput,
  deps: ImportInventoryDeps,
): Promise<ImportInventoryResult> {
  const model = deps.model ?? getInventoryImportModel();
  if (!model) return { ok: false, reason: "no-model" };

  const generate = deps.generate ?? generateObject;
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const userText =
      attempt === 1
        ? "Catalog every bottle visible in this image."
        : `Previous extraction failed: ${lastError}. Try again — catalog every bottle visible in this image.`;

    try {
      const { object } = await generate({
        model,
        schema: InventoryImportResult,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", image: input.image_b64, mediaType: input.media_type },
              { type: "text", text: userText },
            ],
          },
        ],
      });

      return {
        ok: true,
        bottles: (object as InventoryImportResult).bottles,
        attempts: attempt,
      };
    } catch (e) {
      lastError = (e as Error).message;
    }
  }

  return { ok: false, reason: "extract-failed", detail: lastError };
}
