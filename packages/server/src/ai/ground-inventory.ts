import { generateObject, type LanguageModel } from "ai";
import { getLookupModel, DEFAULT_LOOKUP_MODEL } from "./gateway";
import {
  type ExtractedBottle,
  type GroundedBottle,
  InventoryGroundingResult,
} from "./schema";

/**
 * Grounded lookup for bulk inventory import candidates (spec ai-engine.md §7).
 *
 * Takes a vision-extracted bottle (display_name + expression observed from the
 * image) and resolves authoritative product details — brand, distillery,
 * category, ABV, bottle size, and origin — using the Haiku lookup model.
 *
 * - Only fills fields the model is confident about; everything else stays null.
 * - Each grounding carries provenance (grounding_source = model ID,
 *   grounding_confidence, grounding_rationale).
 * - If the model is unavailable or the lookup throws, the candidate is returned
 *   as-is with all grounded fields null — the batch never crashes.
 */

export interface GroundBottleDeps {
  /**
   * Override model for tests. Pass `null` to force degradation (no grounding);
   * `undefined` uses the gateway's default lookup model.
   */
  model?: LanguageModel | null;
  generate?: typeof generateObject;
  /** Override the model ID string written into grounding_source. */
  sourceLabel?: string;
}

const SYSTEM = `You are a spirits database assistant. Given a bottle label as read from a bar photo, resolve authoritative product details.

Return ONLY fields you are reasonably confident about — use null for anything uncertain. DO NOT GUESS.

Field rules:
- brand: the brand name only (e.g. "Maker's Mark", not the full product name).
- distillery: producing distillery or company (null when uncertain or multi-source).
- category: one of { gin, bourbon, rye, scotch, rum, tequila, mezcal, brandy, amaro, vermouth, liqueur, bitters, spirit }. Use "spirit" when nothing fits.
- size_ml: standard bottle size (e.g. 750, 1000, 375, 700, 50). null when not determinable from the name/expression alone.
- abv: decimal 0..1 (40% = 0.40). null when uncertain.
- origin_country: ISO 3166-1 alpha-2 ONLY (US, GB, MX, JM, FR, IT, BB, …). null when unknown or multi-origin.
- confidence: high (well-known product, certain), medium (likely correct, minor caveats), low (uncertain — operator must verify).
- rationale: 1-2 sentences on your sources and any uncertainty.`;

function buildGroundingQuery(candidate: ExtractedBottle): string {
  const parts = [`Bottle label: "${candidate.display_name}"`];
  if (candidate.expression) {
    parts.push(`Expression/version: "${candidate.expression}"`);
  }
  return parts.join("\n");
}

function degraded(candidate: ExtractedBottle): GroundedBottle {
  return {
    ...candidate,
    origin_country: null,
    grounding_source: null,
    grounding_confidence: null,
    grounding_rationale: null,
  };
}

export async function groundBottle(
  candidate: ExtractedBottle,
  deps: GroundBottleDeps = {},
): Promise<GroundedBottle> {
  const model = deps.model !== undefined ? deps.model : getLookupModel();
  if (!model) return degraded(candidate);

  const generate = deps.generate ?? generateObject;
  const sourceLabel = deps.sourceLabel ?? DEFAULT_LOOKUP_MODEL;

  try {
    const { object } = await generate({
      model,
      schema: InventoryGroundingResult,
      system: SYSTEM,
      prompt: buildGroundingQuery(candidate),
      temperature: 0.1,
    });

    const grounded = object as InventoryGroundingResult;

    return {
      ...candidate,
      brand: grounded.brand,
      distillery: grounded.distillery,
      category: grounded.category,
      size_ml: grounded.size_ml,
      abv: grounded.abv,
      origin_country: grounded.origin_country,
      grounding_source: sourceLabel,
      grounding_confidence: grounded.confidence,
      grounding_rationale: grounded.rationale,
    };
  } catch {
    return degraded(candidate);
  }
}

/**
 * Ground a batch of extracted bottles in parallel. Each bottle is grounded
 * independently — a failure on one never affects the others.
 */
export async function groundBatch(
  candidates: ExtractedBottle[],
  deps: GroundBottleDeps = {},
): Promise<GroundedBottle[]> {
  const results = await Promise.allSettled(
    candidates.map((c) => groundBottle(c, deps)),
  );
  return results.map((r, i) =>
    r.status === "fulfilled" ? r.value : degraded(candidates[i]!),
  );
}
