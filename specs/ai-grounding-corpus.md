# Corpus Manifest — what the tools, RAG, and seeds run against

> The full data inventory behind `specs/ai-grounding-plan.md`. Every corpus
> lists: what it is, source + license, what we extract, the target table/shape,
> the normalization step, and which tools/phase consume it. Build pipeline is
> `scripts/build-flavor-corpus.ts` (idempotent, build-time only — never fetched
> at request time).

**Licensing posture (locked):** bundle only **CC-BY / MIT / CC0 / ODbL**. Treat
**NonCommercial** sources (FlavorDB, FooDB, GoodScents, Flavornet) as
**reference-only** — read them to *author our own descriptors*, never ship their
rows. No book prose, no copyrighted flavor wheels. This is the existing Backbar
copyright doctrine.

---

## Corpus index

| ID | Corpus | Origin | License | Bundled? | Phase | Feeds |
|---|---|---|---|---|---|---|
| **A** | Ingredient flavor profiles | **Authored** (ours) | n/a (ours) | ✅ | 1 | `flavor_profile`, `check_balance`, descriptors in context |
| **B** | Molecular pairing network | Ahn 2011 (Zenodo) | CC BY 4.0 | ✅ | 2 | `pairing_score` (molecular term) |
| **C** | Co-occurrence pairing | Derived from canon (D) | ours | ✅ | 2 | `pairing_score` (primary term), `top_pairings` |
| **D** | Canon recipe expansion | rasmusab/iba-cocktails | MIT | ✅ | 2 | `CANON_RECIPES`, source for C |
| **E** | Ingredient + substitute taxonomy | bar-assistant/data | MIT | ✅ | 2 | `ingredient_substitute`, `flavor_similar` |
| **F** | Cocktail root templates | Cocktail Codex *framework* (facts) | facts | ✅ | 1/3 | `classify_family`, `suggest_ratio`, `root_template` |
| **G** | Food-pairing rules | Authored (facts) | ours | ✅ | 3 | `score_food_pairing` |
| **H** | Dilution / acid constants | Arnold equations (facts) | facts | ✅ | 1/2 | `compute_dilution`, `acid_adjust` |
| **I** | Descriptor reference (read-only) | FlavorDB2 / GoodScents / Flavornet / WCR | NC / restricted | ❌ ref-only | 1 | informs A's wording |
| **J** | Normalization maps | Authored crosswalk | ours | ✅ | 2 | resolve B/D/E slugs → our refs |
| **K** | Live enrichment (optional) | TheCocktailDB | gated | ❌ query-only | later | optional lookup tool |

---

## A. Ingredient flavor profiles *(keystone — authored)*

The single most important corpus: without per-ingredient axes there is no
*computable* balance, and these descriptors are the "strong context" the model
reads. ~120 rows covering our category/tag vocabulary plus notable named products.

- **Coverage:** every `category` (gin, bourbon, rye, blanco/reposado tequila, the
  rum families, vodka, brandy/cognac, vermouth dry/sweet, amaro, liqueur,
  citrus, juice, syrup-simple/rich, bitters, wine, …), every recurring `tag`
  (sweet-vermouth, dry-vermouth, lime, lemon, orgeat, column-still-rum, …), and
  high-signal `product`s (Campari, Angostura, maraschino, Chartreuse, Cointreau).
- **Row shape** → table `flavor_profile`:
  ```ts
  { ref: "campari", ref_type: "product",
    descriptors: ["bitter-orange","rhubarb","gentian","clove","red-fruit"],
    axes: { sweet: 0.35, sour: 0, bitter: 0.8, strong: 0.4, aromatic: 0.6 },
    typical_abv: 0.24, intensity: 0.8, role: "amaro-bitter",
    notes: "Backbone bitter for the Negroni family." }
  ```
  (`dilution` axis is method-driven, not per-ingredient.)
- **Authoring source:** our existing `Product.flavor_tags` + `ProductTag`
  (`smugglers-cove`, `cocktail-codex`, `flavor`) as the spine, with wording
  informed by corpus **I** (read FlavorDB/GoodScents/WCR for accuracy, **write our
  own** descriptors — facts/our-words, nothing copied).
- **Build:** authored TS in `packages/db/seed/flavor/profiles.ts`, zod-validated.
  Axes calibrated so canon recipes reproduce their hand-set `balance` (regression
  test: seeded canon `balance` ≈ `aggregateBalance` over profiles).

## B. Molecular pairing network — Ahn 2011

- **Source:** Zenodo `flavor_network_data.zip` (CC BY 4.0). Files used:
  `ingr_comp/ingr_info.tsv` (1,530 ingredients), `comp_info.tsv` (1,107
  compounds), `ingr_comp.tsv` (36,781 links); optional precomputed
  `flavor_network_backbone/`.
- **Extract:** project the bipartite graph to ingredient–ingredient
  `shared_compounds(a,b)`; normalize to Jaccard. Drop the known "Farnesol"
  self-loop. Attribute Ahn 2011 + Fenaroli.
- **Target:** `flavor_pairing.molecular` (0..1), keyed by **our refs** after
  normalization (J). Unresolved Ahn slugs are dropped — partial coverage is fine.
- **Consumer:** `pairing_score` *secondary, labeled exploratory* (spike §2).

## C. Co-occurrence pairing *(primary pairing signal)*

- **Source:** our canon (D) + any seeded recipes — count ingredient pairs that
  co-appear; score with PMI / normalized co-occurrence.
- **Target:** `flavor_pairing.cooccurrence` (0..1) over our refs (no normalization
  needed — already our vocabulary).
- **Consumer:** `pairing_score` *primary*, `top_pairings`. Blended in
  `pairingBlend()` as `0.6·cooccurrence + 0.3·descriptor + 0.1·molecular`,
  **renormalized over whichever signals are present** (weights tunable; molecular
  is flagged exploratory).

## D. Canon recipe expansion — IBA

- **Source:** `github.com/rasmusab/iba-cocktails` (MIT) — IBA official ~89 specs,
  CSV/JSON.
- **Extract:** names, ingredients, metric amounts, method/glass.
- **Target:** append to `CANON_RECIPES` (`packages/db/seed/canon.ts`), normalized
  to our `ref_type/ref_id` vocabulary via **J**; zod-validated.
- **Consumer:** makeability/menu, and the substrate for **C**.

## E. Ingredient + substitute taxonomy — bar-assistant

- **Source:** `github.com/bar-assistant/data` (MIT) — 250+ ingredients with
  categories + **substitutes**, JSON-schema.
- **Extract:** ingredient → category/subcategory enrichment + substitute pairs.
- **Target:** `ingredient_substitute(ref, substitute_ref, note)`; category hints
  fold into **A**.
- **Consumer:** `flavor_similar` (seeded substitutes outrank computed similarity),
  riff swaps, one-away suggestions.

## F. Cocktail root templates — Cocktail Codex *framework*

- **Source:** the *taxonomy* (six roots + discriminators) — facts, not prose.
- **Rows** → `root_template`:
  ```
  daiquiri  | spirit + citrus + syrup       | shake | sweetener=syrup  | 2:0.75:0.75 | [sour, gimlet, margarita-ish]
  sidecar   | spirit + citrus + liqueur      | shake | sweetener=liqueur| 2:0.75:0.75 | [margarita, cosmo, last-word]
  old-fash. | spirit + sugar + bitters       | build/stir | sweetener=sugar+bitters | 2:0.25 | [sazerac, oaxaca-of]
  martini   | spirit + aromatized wine       | stir  | wine-modifier    | 2:1 .. 6:1  | [manhattan, negroni, martinez]
  highball  | spirit + carbonated lengthener | build | carbonation      | 1:3         | [g&t, mojito, paloma, spritz]
  flip      | spirit + sugar + egg/dairy     | shake | richness=egg/dairy| 2:1 + egg   | [alexander, fizz, nog]
  ```
- **Consumer:** `classify_family`, `suggest_ratio`. Discriminators are encodable
  predicates (sweetener source; presence of citrus/egg/dairy/carbonation).

## G. Food-pairing rules *(authored facts, Phase 3)*

- **Taste-interaction matrix** `taste_interaction(taste_a, taste_b, weight)` —
  6×6 ± weights: acid↔fat +, sweet↔heat +, bitter↔rich +, salt↔bitter + (suppress),
  umami↔bitter −, etc.
- **Cuisine affinity** `cuisine_affinity(cuisine, spirit_ref, weight)` — "what
  grows together" (tequila↔Mexican, rum↔tropical, genever↔Dutch…).
- **Intensity/weight + aroma-bridge** computed from **A** descriptors + ABV.
- **Consumer:** `score_food_pairing` (`score = w1·intensity + w2·max(complement,
  contrast) + w3·tasteMatrix + w4·aromaBridge + w5·cuisineAffinity`).

## H. Dilution / acid constants — Arnold (facts)

- Already partly in `core/balance.ts` (`METHOD_DILUTION`). Add: stirred-dilution
  regression `−1.21·ABV² + 1.26·ABV + 0.145`, `ABV_final = ABV·V/(V+water)`,
  acid model (lime ≈ 6% acidity; citric:malic 2:1; fine blend 4%/2%/0.04%).
- **Consumer:** `compute_dilution`, `acid_adjust`.

## I. Descriptor reference — read-only *(never bundled)*

- FlavorDB2 (`cosylab.iiitd.edu.in/flavordb2`), GoodScents/Flavornet via **Pyrfume**
  (`github.com/pyrfume/pyrfume-data`), WCR Sensory Lexicon (110 attributes).
- **Use:** consulted while authoring **A** for descriptor accuracy. Their *rows/text
  are not copied or shipped* (NonCommercial / all-rights-reserved). Cited as
  reference in code comments.

## J. Normalization maps *(authored crosswalk — the fiddly glue)*

- `ref-normalize.ts`: external slug → our `{ref_type, ref_id}` for Ahn (B) and
  bar-assistant (E). e.g. Ahn `gin`→`category:gin`, `lime_juice`→`tag:lime`,
  `campari`→`product:campari`.
- **Partial coverage is acceptable**: unresolved external entries are dropped and
  the dependent tools return "unknown" rather than failing a generation.

## K. Live enrichment — TheCocktailDB *(optional, query-only)*

- `thecocktaildb.com/api.php` — query live for enrichment if ever needed; **never
  bundled** (reuse/image rights murky). Out of scope unless a concrete need arises.

---

## Build pipeline (`scripts/build-flavor-corpus.ts`)

1. Fetch Ahn zip (B) + clone rasmusab (D) + bar-assistant (E) into a build cache.
2. Normalize via **J** → write `flavor_pairing` (B+C), `ingredient_substitute` (E),
   appended `CANON_RECIPES` (D), `root_template` (F).
3. **A** and **G** are authored TS, not fetched — validated here.
4. Emit a coverage report (how many of our refs got molecular/co-occurrence/
   substitute data) so partial coverage is visible, not silent.

All outputs zod-validated; the migration creates the tables; `bun run --filter db
seed` loads them. Re-running is idempotent.
