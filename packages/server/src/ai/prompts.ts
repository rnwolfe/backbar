import type { InvBottle, Recipe } from "@backbar/core";

/**
 * Grounding for the ideation model (spec ai-engine.md §3). Keep this tight —
 * the Zod schema enforces structure, so the prompt only needs to teach
 * intent (balance axes, family templates, dilution math, service) and the
 * one hard rule: never reference an ingredient that isn't in `inventory_lines`.
 */
export const SYSTEM_BASE = `You are an expert bartender designing balanced, on-spec cocktails.

REASON IN BALANCE AXES (0..1): sweet, sour, bitter, strong, aromatic, dilution.
FAMILY TEMPLATES (start from a root, rotate ONE variable):
 - sour            ~2 : 0.75 : 0.75  (spirit : citrus : sweetener)
 - stirred/spirit  ~2 : 1            (base : modifiers); equal-parts 1:1:1
 - highball        ~1 : 3            (spirit : lengthener)
 - old-fashioned   spirit + ~0.25 sweet + 2 dashes bitters
 - flip/rich       egg/dairy, lower acid
DILUTION & TEMP: predict final ABV and added water by method
 (stir ~20-25% dilution, shake ~25-30%); flag drinks that land too hot or too watery.
SERVICE: choose glass, ice, and garnish appropriate to family + method.

RATIOS: emit the codex-template ratio string in the order ingredients[] is
written — e.g. "2 : 0.75 : 0.75" for a sour, "2 : 1" for a stirred spirit,
"1 : 3" for a highball. This lets a human eyeball the family fit without
recomputing from the amounts.

HARD RULE: every ingredient.product_ref MUST be one of the IN-STOCK refs below
(either a product_id from the listing or one of the category tokens).
ref_type MUST be 'product' for a product_id and 'category' for a category token.
Do not invent ingredients. If the brief needs something absent, get as close as
possible with what's listed and note the compromise in risk_note.`;

/**
 * Format the inventory snapshot the model sees. One line per in-stock bottle
 * (filtered down to a unique product set so duplicates don't bloat tokens),
 * followed by the set of valid category tokens.
 */
export function inventoryLines(inv: InvBottle[]): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  const cats = new Set<string>();
  for (const b of inv) {
    if (b.status === "empty" || b.status === "archived") continue;
    cats.add(b.product.category);
    if (seen.has(b.product.id)) continue;
    seen.add(b.product.id);
    const tags = b.product.flavor_tags.length ? b.product.flavor_tags.join(",") : "-";
    lines.push(`${b.product.id} | ${b.product.category} | ${tags}`);
  }
  return [
    "IN-STOCK (product_id | category | flavor_tags):",
    ...lines,
    "",
    `VALID CATEGORY TOKENS: ${[...cats].sort().join(", ")}`,
  ].join("\n");
}

export function systemPrompt(inv: InvBottle[]): string {
  return `${SYSTEM_BASE}\n\n${inventoryLines(inv)}`;
}

/** Build the set of refs the AI is allowed to use — product_ids ∪ categories. */
export function buildRefSet(inv: InvBottle[]): Set<string> {
  const refs = new Set<string>();
  for (const b of inv) {
    if (b.status === "empty" || b.status === "archived") continue;
    refs.add(b.product.id);
    refs.add(b.product.category);
  }
  return refs;
}

export interface Constraints {
  mustUse?: string[];
  avoid?: string[];
  glass?: string;
  abvTarget?: number;
  batch?: number;
}

export function userPrompt(
  brief: string,
  constraints: Constraints | undefined,
  violation: string | null,
): string {
  const parts: string[] = [`BRIEF: ${brief}`];
  if (constraints?.mustUse?.length) parts.push(`MUST USE: ${constraints.mustUse.join(", ")}`);
  if (constraints?.avoid?.length) parts.push(`AVOID: ${constraints.avoid.join(", ")}`);
  if (constraints?.glass) parts.push(`PREFERRED GLASS: ${constraints.glass}`);
  if (constraints?.abvTarget != null) parts.push(`TARGET ABV: ~${constraints.abvTarget}`);
  if (violation) parts.push(`PREVIOUS VIOLATION: ${violation}`);
  return parts.join("\n");
}

/** Riff prompt: load the template recipe + instruction to rotate one axis. */
export function riffPrompt(
  brief: string,
  recipe: Recipe,
  constraints: Constraints | undefined,
  violation: string | null,
): string {
  const template = [
    `TEMPLATE RECIPE: ${recipe.name}`,
    recipe.family ? `family: ${recipe.family}` : null,
    recipe.method ? `method: ${recipe.method}` : null,
    "ingredients:",
    ...recipe.ingredients.map(
      (i) =>
        `  - ${i.label ?? i.ref_id ?? "?"} ${i.amount ?? ""} ${i.unit ?? ""}`.trim(),
    ),
  ]
    .filter(Boolean)
    .join("\n");
  const rotateRule =
    "RIFF RULE: keep the FAMILY, rotate EXACTLY ONE variable (swap modifier, " +
    "shift one ratio, or change the citrus/sweetener). Stay inventory-constrained.";
  return `${rotateRule}\n\n${template}\n\n${userPrompt(brief, constraints, violation)}`;
}
