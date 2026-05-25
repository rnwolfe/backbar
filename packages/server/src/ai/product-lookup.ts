import { generateObject, type LanguageModel } from "ai";
import { getLookupModel } from "./gateway";
import { ProductLookupResult, type ProductLookupRequest } from "./schema";

/**
 * Structured AI metadata extraction for the Add Product modal.
 *
 * The model fills in distillery / origin / age / canonical tags so the
 * operator confirms+edits rather than typing from scratch. Output is Zod-
 * validated; the UI surfaces a confidence indicator + lets the operator
 * override any field before submit.
 *
 * Uses the cheap/fast model (Haiku 4.5) — this is a factual lookup, not a
 * creative task.
 */

export interface ProductLookupDeps {
  /** Override model (test injection). Defaults to the gateway's Haiku 4.5. */
  model?: LanguageModel;
  /** Override generateObject (test injection). */
  generate?: typeof generateObject;
}

export type ProductLookupOutcome =
  | { ok: true; result: ProductLookupResult }
  | { ok: false; reason: "no-model" | "extract-failed"; detail?: string };

const SMUGGLERS_COVE_RUM_CLASSES = [
  "white-light-rum",
  "white-pot-still-rum",
  "amber-light-lightly-aged-rum",
  "amber-rich-medium-aged-rum",
  "amber-rich-pot-still-rum",
  "dark-rum",
  "blended-overproof-rum",
  "blended-aged-rum",
  "pot-still-rum",
  "column-still-rum",
  "agricole-rhum",
  "cachaca",
];

const COCKTAIL_CODEX_ROOTS = [
  "old-fashioned-root",
  "martini-root",
  "daiquiri-root",
  "sidecar-root",
  "whisky-highball-root",
  "flip-root",
];

const SYSTEM_PROMPT = `You are a cocktail-bar inventory assistant. The operator is adding a product to their catalog and wants metadata pre-filled.

Return ONLY what you are reasonably confident about. Use null for fields you don't know — DO NOT GUESS values like ABV, age statement, or origin country.

Field rules:
- suggested_id: lowercase kebab-case slug, no spaces, no punctuation. Should disambiguate (e.g. "buffalo-trace-bourbon" not "buffalo-trace" if the latter is ambiguous).
- category: pick from { gin, bourbon, rye, scotch, rum, tequila, mezcal, brandy, amaro, vermouth, liqueur, bitters, syrup-simple, syrup-rich, citrus, juice, spirit }. Use "spirit" as the umbrella when nothing fits.
- subcategory: free-form refinement (e.g. "kentucky-straight", "london-dry", "jamaican-rum", "aperitivo").
- origin_country: ISO-3166-1 alpha-2 ONLY (US, BB, MX, JM, FR, IT, …). null if unknown or multi-origin.
- age_statement_y: number of years on the label. null when NAS (no-age-statement). 12-year = 12.
- abv: decimal 0..1 (40% = 0.40). null if uncertain.
- flavor_tags: short freeform tags (e.g. "smoky", "vanilla", "herbal", "bitter"). 2-5 tags.
- tags: namespaced taxonomy tags. Use these namespaces when applicable:
  * smugglers-cove (RUMS ONLY): pick from ${SMUGGLERS_COVE_RUM_CLASSES.join(", ")}
  * cocktail-codex (spirits commonly used as a recipe root): pick from ${COCKTAIL_CODEX_ROOTS.join(", ")}
  Format: { namespace: "smugglers-cove", value: "blended-overproof-rum" }
  Multiple tags per namespace are fine. Skip namespaces that don't apply.
- confidence: high (well-known SKU you're sure about), medium (educated guess on most fields), low (uncertain — operator should verify carefully).
- rationale: 1-2 sentences explaining your sources / what you weren't sure about.

Examples of *good* output:
- Planteray OFTD: smugglers-cove tags ["blended-overproof-rum", "pot-still-rum"]; origin_country "BB" (Foursquare-based blend); abv 0.69
- Buffalo Trace: category "bourbon", subcategory "kentucky-straight", origin "US"/"Kentucky", distillery "Buffalo Trace Distillery", cocktail-codex tag ["old-fashioned-root", "manhattan-root"], abv 0.45
- Carpano Antica: category "vermouth", subcategory "sweet", origin "IT", abv 0.165, flavor_tags ["sweet-vermouth", "herbal", "vanilla"]`;

export async function lookupProduct(
  req: ProductLookupRequest,
  deps: ProductLookupDeps = {},
): Promise<ProductLookupOutcome> {
  const model = deps.model ?? getLookupModel();
  if (!model) return { ok: false, reason: "no-model" };
  const generate = deps.generate ?? generateObject;

  const prompt = req.hint
    ? `Product name: "${req.name}"\nHint from operator: ${req.hint}`
    : `Product name: "${req.name}"`;

  try {
    const { object } = await generate({
      model,
      schema: ProductLookupResult,
      system: SYSTEM_PROMPT,
      prompt,
      temperature: 0.2,
    });
    return { ok: true, result: object as ProductLookupResult };
  } catch (err) {
    return {
      ok: false,
      reason: "extract-failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
