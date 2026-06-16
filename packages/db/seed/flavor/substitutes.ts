import type { IngredientSubstitute } from "@backbar/core";

/**
 * Corpus E — authored ingredient substitutions (flavor-close, role-compatible
 * swaps). Seeded substitutes outrank computed similarity in `flavor_similar`.
 * `bidirectional` pairs are inserted both ways at seed time.
 *
 * Bar-assistant/data (MIT) is the model for a richer substitute graph; this is
 * a curated starter set over our own vocabulary, expandable by the build script.
 */
export interface SeedSubstitute extends IngredientSubstitute {
  bidirectional?: boolean;
}

export const SUBSTITUTES: readonly SeedSubstitute[] = [
  { ref: "rye", substitute_ref: "bourbon", note: "Softer and sweeter; loses rye's peppery snap.", bidirectional: true },
  { ref: "lime", substitute_ref: "lemon", note: "Brighter and rounder; rebalance sweetener slightly.", bidirectional: true },
  { ref: "lime-juice", substitute_ref: "lemon-juice", note: "Brighter, less green.", bidirectional: true },
  { ref: "cointreau", substitute_ref: "orange-curacao", note: "Richer and less dry; nudge it down a touch.", bidirectional: true },
  { ref: "orange-liqueur", substitute_ref: "cointreau", note: "Cleaner, drier orange." },
  { ref: "simple-syrup", substitute_ref: "syrup-rich", note: "Use ~⅔ the volume — rich syrup is ~1.5–2× sweeter.", bidirectional: true },
  { ref: "sweet-vermouth", substitute_ref: "carpano-antica", note: "Richer, more vanilla and spice." },
  { ref: "dry-vermouth", substitute_ref: "dolin-dry", note: "Clean alpine dry vermouth." },
  { ref: "campari", substitute_ref: "amaro", note: "Less punchy bitter-orange; pick an aperitivo-style amaro." },
  { ref: "amaro", substitute_ref: "campari", note: "More aggressive bitter-orange." },
  { ref: "angostura-bitters", substitute_ref: "peychauds-bitters", note: "Lighter, anise-forward, cherry note; not a clean swap.", bidirectional: true },
  { ref: "gin", substitute_ref: "vodka", note: "Neutral — drops all the botanicals; only for a softer build." },
  { ref: "aged-rum", substitute_ref: "jamaican-rum", note: "Adds funk and esters; more assertive.", bidirectional: true },
  { ref: "white-rum", substitute_ref: "blanco-tequila", note: "Swaps cane for agave — a different drink, but both light and dry." },
  { ref: "blanco-tequila", substitute_ref: "mezcal", note: "Adds smoke; reduce other aromatics to compensate." },
  { ref: "bourbon", substitute_ref: "aged-rum", note: "Trades oak-and-corn for molasses warmth; works in spirit-forward builds." },
];
