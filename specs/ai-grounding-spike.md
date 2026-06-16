# Spike — Grounding the AI Mixology Agent in Flavor Science, Mixology & Food Pairing

> **Status:** research spike (exploratory, not authoritative). Extends
> `specs/ai-engine.md`. Goal: survey what we could instrument the agent with to
> give it real expertise in cocktail balance, flavor pairing, and food pairing —
> and recommend a buildable path that respects Backbar's copyright + "AI never
> trusted re: inventory" doctrines.

---

## 0. TL;DR

The agent today is a single schema-constrained `generateObject` call with an
inventory-only repair loop. It **prompts** balance/family/dilution knowledge but
never **checks** generated drinks against the math we already have in
`packages/core`. The highest-leverage, zero-licensing-risk move is to turn that
existing math into **deterministic tools that both the LLM can call and the
repair loop can enforce** — a "is this actually balanced / correctly diluted /
the family it claims?" guardrail, mirroring the inventory guardrail.

On top of that, three additive grounding layers, in ROI order:

1. **Core validator/calculator tools** (pure `packages/core`) — balance, dilution, ABV, acid-adjust, shake-vs-stir, family-fit. No external data, no licensing risk. **Build first.**
2. **Pairing hints from the Ahn 2011 flavor network** (CC-BY) — a precomputed ingredient↔ingredient shared-compound table exposed as a `flavorPairingScore` tool. **Framed as exploratory, never authoritative.**
3. **Food↔cocktail pairing scorer** (deterministic rules + small seeded tables) — a new capability/mode, the most novel and the most product-differentiating.

Reality check from the research: the **molecular shared-compound pairing
hypothesis is weak and culturally biased** (Ahn et al. found it holds for
Western cuisines but *reverses* for East Asian, and the Western signal collapses
without dairy/egg/vanilla). **Recipe co-occurrence is a stronger pairing signal
than molecular overlap.** So pairing tools are *suggestion-grade*, and we should
prefer "these co-appear in real cocktails" over "these share aroma molecules."

---

## 1. Where the agent stands today (grounded in code)

| Mode | Entry | Mechanism |
|---|---|---|
| make-now | `POST /ai/ideate` `mode:"now"` | invent using only in-stock refs |
| riff | `mode:"riff"`+`recipe_id` | rotate exactly one variable, stay in family |
| shopping-muse | `GET /ai/shopping` | **deterministic** `coverage()` rank of one-away unlocks (no model) |
| recipe photo import | `POST /recipes/import-photo` | vision OCR → fuzzy product match → draft |
| bulk inventory import | `POST /inventory/import-photo` | gpt-4o detect → Haiku ground per bottle |
| product lookup | `POST /ai/product-lookup` | Haiku pre-fill metadata |

**Contract** — `GeneratedSpec` (`packages/server/src/ai/schema.ts:8`): name, family,
method, `ratios` string, glass/ice/garnish, `ingredients[{product_ref, ref_type,
amount, unit}]`, `predicted_balance` (6 axes), `abv_estimate`, rationale, risk_note.

**Repair loop** (`packages/server/src/ai/ideate.ts:83`): generate → check every
`product_ref ∈ validRefs` (live product_ids ∪ categories) → re-prompt once on
violation → after 2 attempts off-inventory, return `{ok:false}` and route to
shopping-muse. **The only thing validated is inventory membership.**

**Domain knowledge already in code** (the foundation to build on):
- `packages/core/src/balance.ts` — `METHOD_DILUTION` (build 0, stir .22, shake .32, …, Liquid-Intelligence-calibrated), 6-axis balance (sweet/sour/bitter/strong/aromatic/dilution), `finalAbv()`, `aggregateBalance()`, `balanceFlags()` (too_hot ABV>.30, too_watery ABV<.08).
- `packages/core/src/units.ts` — `UNIT_ML`, `DENSITY_BY_CATEGORY` (g/ml per category), high-proof fork.
- `packages/core/src/makeability.ts` — `MakeabilityState`, binding policies, `FREEFORM_OK`, tag-ref matching, `coverage()`.
- `packages/core/src/schema.ts` — `Product.flavor_tags`, `ProductTag` namespaces (`smugglers-cove`, `cocktail-codex`, `flavor`, `operator`), recipe families.
- `packages/server/src/ai/prompts.ts` — `SYSTEM_BASE` teaches families/ratios/dilution **as prose to the model**; `inventoryLines()` grounds in stock.

**The gap:** all that balance/dilution/family knowledge lives in the *prompt* and
in *unused* core helpers. The model self-reports `predicted_balance`/`abv_estimate`;
nothing recomputes them from resolved products or rejects an unbalanced drink.

**Extension points (from the code map):**
- Post-generation validation hook in `ideate.ts` (alongside the inventory check).
- `Constraints` type in `prompts.ts` can carry pairing/avoid hints.
- No tool/function-calling today — only `generateObject`. Adopting AI-SDK tools is its own decision (§4).

---

## 2. The honest science caveat

Before instrumenting "flavor pairing," internalize what the literature actually says:

- **Foodpairing.com** (shared-volatile-compound pairing) is **closed/B2B** — no open API or dataset. Not usable.
- **Ahn, Ahnert, Bagrow & Barabási (2011), "Flavor network and the principles of food pairing"** (*Sci. Rep.* 1:196, **CC BY**): shared-compound pairing holds for North American/Western European cuisines but **reverses** for East Asian/Southern European; the Western effect is **driven by a few staples (dairy, egg, vanilla)** and largely collapses without them. Widely critiqued ("debunked" as a universal law).
- **Therefore:** molecular overlap = a *soft, exploratory* "adventurous bridge" hint. **Recipe co-occurrence** ("these two show up together in real cocktails") is the more reliable signal and we already have a recipe corpus to mine.

This maps cleanly onto our doctrine: pairing scores *suggest*; the deterministic
balance/makeability tools *decide*.

---

## 3. Building blocks surveyed (data + licensing)

Licensing is the gate. Backbar's rule — *seed facts/frameworks, never bundle
restricted prose* — already filters most of this.

| Source | Provides | License | Verdict |
|---|---|---|---|
| **Ahn 2011 flavor network** ([Zenodo](https://zenodo.org/records/11449658)) | 1,530 ingredients, 1,107 compounds, 36,781 ingredient–compound links; precomputed ingredient–ingredient shared-compound backbone | **CC BY 4.0** | ✅ **Bundle.** The one clean *pairing* dataset. Food-oriented; thin on bar specifics; slugs need normalization. |
| **rasmusab/iba-cocktails** ([GitHub](https://github.com/rasmusab/iba-cocktails)) | IBA official ~89 canon specs, clean CSV/JSON | **MIT** | ✅ **Bundle.** Best canon seed. |
| **bar-assistant/data** ([GitHub](https://github.com/bar-assistant/data)) | 500+ recipes, 250+ ingredients w/ categories + **substitutes**, JSON-schema | **MIT** | ✅ **Bundle.** Ingredient/substitute taxonomy; closest prior art. |
| **USDA FoodData Central** | nutrition/composition (no aroma) | **CC0** | ✅ normalization glue |
| **Open Food Facts** | products, taxonomies (no aroma) | **ODbL** | ✅ normalization glue |
| **FlavorDB2 / FooDB / GoodScents / Flavornet** (via [Pyrfume](https://github.com/pyrfume/pyrfume-data)) | per-ingredient aroma descriptors ("juniper: piney, resinous, citrus") | **NonCommercial** (mostly) | ⚠️ **Reference/internal only**, or derive our own tags. Don't bundle into a shipped product. |
| **WCR Sensory Lexicon** | 110 attributes w/ definitions + intensity refs | "all rights reserved" (free download) | ⚠️ cite as reference; write our own definitions |
| **TheCocktailDB** | ~600 drinks, JSON REST | crowd-sourced, reuse murky, images murky | ⚠️ **query live, don't bundle** |
| **Difford's, book prose, copyrighted flavor wheels** | rich notes | © | ❌ never bundle; books enter via photo-import only |

**Frameworks (facts, freely encodable — not data to license):** the *Cocktail
Codex* six root templates (Old-Fashioned, Martini, Daiquiri, Sidecar, Highball,
Flip) and their discriminators (sweetener = syrup vs liqueur; shake = has
citrus/egg/dairy); sour/stirred/equal-parts ratios; Dave Arnold's dilution
regression `dilution ≈ −1.21·ABV² + 1.26·ABV + 0.145` and `ABV_final =
ABV·V/(V+water)`; acid-adjust blends (lime ≈ 6% acidity; citric:malic 2:1).

---

## 4. How to instrument the agent — three mechanisms + one decision

Per repo conventions (`core` pure/IO-free/zod-first; AI never trusted):

- **(M1) Pure deterministic tools → `packages/core`.** Math/logic, unit-tested,
  no LLM. Double duty: callable by the agent *and* used by the repair loop to
  reject bad output. This is where balance/dilution/ABV/pairing-score math lives.
- **(M2) Seeded knowledge → `packages/db`.** Canon classics, ingredient/substitute
  taxonomy, root-template rows, aroma-tag table, taste-interaction matrix,
  cuisine→spirit affinity, the Ahn pairing table. All zod-parsed at ingest.
- **(M3) RAG / LLM-with-retrieval → `packages/server/ai`.** Creative ideation,
  narrative/menu copy, fuzzy substitution, photo-import. Corpus = *licensed
  facts only*. Every proposal is then run through the M1 tools.

**Decision — adopt AI-SDK tool-calling?** Today we use `generateObject` only.
Two ways to feed the new grounding to the model:
- **(a) Context injection (no tool-calling):** precompute pairing/family hints and
  inject into the system/user prompt; validate output post-hoc with M1 tools and
  re-prompt. Lowest lift, keeps the schema-only pipeline, deterministic.
- **(b) Function-calling:** register M1 tools (`flavorPairingScore`,
  `balanceChecker`, …) so the model calls them mid-reasoning. More agentic,
  better for multi-step "design + self-check," but needs the AI-SDK tool loop and
  careful validation that the gateway model supports tools well.

**Recommendation:** start with **(a) + post-hoc validation** (it reuses the
existing repair-loop shape and is the smallest change), and graduate the *riff*
and a future *food-pairing* mode to **(b)** once the M1 tools exist and are tested.

---

## 5. Capability options (the menu)

Each: what it adds · how it plugs in · data/licensing · effort/value.

### Option A — Core balance/dilution/ABV validators *(M1; build first)*
- **What:** `balanceChecker(spec, inv)`, `dilutionCalculator(spec, method)`,
  `abvActual(spec, inv)`, `shakeOrStir(spec)` — recompute from *resolved products*
  and flag too_hot/too_watery/ratio-out-of-band. Replace/cross-check the model's
  self-reported `predicted_balance`/`abv_estimate`.
- **Plug-in:** new `packages/core/src/*` fns + a validation pass in `ideate.ts`
  next to the inventory check (re-prompt on violation; same loop).
- **Data/licensing:** none — all math we already have or that's public fact.
- **Effort/Value:** **Low / High.** Makes the agent *honest* about what it makes.

### Option B — Family-fit checker *(M1)*
- **What:** `familyFit(spec)` → does a drink claiming "sour" actually have
  citrus+sweet in ~2:0.75:0.75? Is a "stirred" all-spirit/clear? Encodes the
  Cocktail Codex six-root discriminators as a pure function.
- **Plug-in:** core fn + validation pass; also powers better *riff* prompts
  ("here are the sound one-variable rotations for this template").
- **Data/licensing:** Codex *framework* = free fact; no prose.
- **Effort/Value:** **Low / High.**

### Option C — Ratio suggester & acid-adjuster *(M1)*
- **What:** `ratioSuggester(ingredients, family)` (canonical start ratio,
  normalized for syrup brix + citrus acidity); `acidAdjuster(juice, target)`
  (grams citric/malic). Turns the agent into a build coach.
- **Data/licensing:** Arnold equations = facts.
- **Effort/Value:** **Low–Med / Med.**

### Option D — Flavor-pairing hint tool (Ahn network) *(M1 + M2)*
- **What:** precompute the ingredient↔ingredient shared-compound table from Ahn
  `ingr_comp.tsv` into a `bun:sqlite` table; expose `flavorPairingScore(a,b)` /
  `topPairings(ingredient, n)`. **Soft hint only.**
- **Plug-in:** seed table in `packages/db`; tool used either as context injection
  (a) or function-call (b). Map our ~100 products → Ahn slugs (needs a normalization
  layer; many bar ingredients won't resolve — degrade gracefully).
- **Data/licensing:** **CC BY** — clean to bundle (attribute Ahn 2011 + Fenaroli).
- **Effort/Value:** **Med / Med.** Caveat §2 — frame as exploratory.

### Option E — Co-occurrence pairing from the recipe corpus *(M1 + M2)*
- **What:** mine canon recipes for "ingredients X and Y co-appear in N real
  cocktails" → an affinity score. **Stronger signal than molecular overlap** and
  uses data we'd seed anyway.
- **Plug-in:** derive at seed time from canon; same tool surface as D (can blend
  D+E into one `pairingScore`).
- **Data/licensing:** from MIT canon seeds — clean.
- **Effort/Value:** **Med / Med-High.** Often the better half of "pairing."

### Option F — Food↔cocktail pairing scorer *(M1 + M2; the differentiator)*
- **What:** new capability/mode — given a dish (or cuisine/ingredients), rank
  makeable cocktails. Deterministic scorer over encodable rules:
  intensity/weight match · complement-or-contrast · a 6-taste interaction matrix
  (acid cuts fat, sweet tames heat, bitter cuts richness, salt lifts, umami×bitter
  penalty) · aroma-bridge (shared tags) · cuisine→spirit affinity. Returns ranked
  pairings + a human-readable "why."
- **Plug-in:** `packages/core/src/pairing.ts` (pure scorer) + small seeded tables
  (taste matrix, cuisine affinity, aroma tags) + new `POST /ai/pair-food` (LLM
  parses the dish to features, scorer ranks, LLM writes the rationale — validated).
- **Data/licensing:** rules are facts; aroma tags from our own `flavor_tags` +
  cited lexicon. Clean.
- **Effort/Value:** **Med-High / High.** Most novel; nothing in the current app does this.

### Option G — Flavor-close substitution *(M1; extends makeability/shopping-muse)*
- **What:** `flavorSimilar(product)` — when one-away or out of stock, suggest the
  closest in-stock alternative by flavor-tag / compound-vector cosine. Improves
  "one bottle away" and riff swaps.
- **Plug-in:** core similarity fn over `flavor_tags` (+ optional Ahn compound
  vectors); surfaced in `coverage()` and riff.
- **Data/licensing:** our tags (clean); Ahn vectors optional (CC BY).
- **Effort/Value:** **Med / Med.**

### Option H — Descriptor RAG for narration *(M3)*
- **What:** retrieve per-ingredient flavor descriptors to ground tasting-note /
  menu copy ("why this works"). Pure language polish, not correctness.
- **Plug-in:** small embedded corpus + retrieval in the ideation prompt.
- **Data/licensing:** ⚠️ FlavorDB/GoodScents are **NonCommercial** — keep internal
  or build our own descriptor set from `flavor_tags` + cited WCR lexicon.
- **Effort/Value:** **Med / Low-Med.** Nice-to-have; licensing caution.

### Option I — Expand canon + substitution taxonomy *(M2; enabling)*
- **What:** seed more classics (rasmusab/iba MIT) and an ingredient *substitutes*
  table (bar-assistant MIT). Feeds D/E/G and makes makeability richer.
- **Effort/Value:** **Low-Med / Med.** Mostly an ingest/normalization task.

---

## 6. Recommended phased path

**Phase 1 — Make the agent honest (M1, no external data).**
Options **A + B (+ C)**. Recompute balance/ABV/dilution from resolved products;
add a family-fit check; extend the repair loop to reject not just off-inventory
but off-balance/off-family drinks (re-prompt with the specific violation). Unit-test
in `core` first per build order. *This alone materially raises output quality and
ships with zero licensing risk.*

**Phase 2 — Pairing as suggestion (M1+M2).**
Seed canon + substitutes (**I**), build the blended **D+E** `pairingScore`
(co-occurrence-weighted, molecular as a minor term), and **G** flavor-close
subs. Wire as context-injection hints first.

**Phase 3 — Food pairing, the differentiator (M1+M2+M3).**
Ship **F** as a new mode/route; graduate riff + food-pairing to AI-SDK
tool-calling (b) so the model self-checks against the M1 tools. Add **H**
narration if a clean descriptor set exists.

Each phase is independently shippable and leaves the "AI never trusted re:
inventory" invariant intact — we're just adding more invariants it's checked against.

---

## 7. Open questions / decisions for you

1. **Tool-calling vs context-injection** (§4) — OK to start with injection +
   post-hoc validation, graduate to function-calling in Phase 3?
2. **How adventurous should pairing be?** Molecular bridges produce surprising
   combos but are unreliable (§2). Default to co-occurrence, offer a "go
   adventurous" toggle that weights molecular overlap up?
3. **Food-pairing scope** — free-text dish, cuisine picker, or "what's in my
   fridge" ingredient list as the input to Option F?
4. **Licensing posture** — confirm we keep NonCommercial sources (FlavorDB etc.)
   out of the bundle and rely on Ahn (CC BY) + MIT canon + our own tags.
5. **Normalization budget** — mapping our ~100 bottles → Ahn/FoodDB slugs is the
   fiddly part of D/G; acceptable to ship partial coverage (degrade gracefully)?

---

## 8. Sources

- Ahn et al. 2011, *Flavor network and the principles of food pairing* — https://www.nature.com/articles/srep00196 · data (CC BY): https://zenodo.org/records/11449658
- Critique — MIT Tech Review: https://www.technologyreview.com/2011/11/29/189470/ · *Food Research International* 2020: https://www.sciencedirect.com/science/article/abs/pii/S0963996920301496
- FlavorDB2: https://cosylab.iiitd.edu.in/flavordb2/ · Pyrfume: https://github.com/pyrfume/pyrfume-data · FooDB: https://foodb.ca/downloads · Flavornet: http://flavornet.org/
- USDA FDC: https://fdc.nal.usda.gov/ · Open Food Facts: https://world.openfoodfacts.org/data
- WCR Sensory Lexicon: https://worldcoffeeresearch.org/resources/sensory-lexicon
- Canon seeds — rasmusab/iba-cocktails (MIT): https://github.com/rasmusab/iba-cocktails · bar-assistant/data (MIT): https://github.com/bar-assistant/data · stevana/cocktails (BSD): https://github.com/stevana/cocktails
- TheCocktailDB API: https://www.thecocktaildb.com/api.php
- Cocktail Codex six families (framework): https://www.thedoublestrainer.com/post/the-6-main-cocktail-families-root-recipes-formulas-and-how-to-build-any-drink
- Dilution/ABV math (Arnold, derived): https://michielstock.github.io/posts/2020/2020-05-21-compuational-mixology/
- Acid-adjusting: https://punchdrink.com/articles/hack-your-drink-acid-adjusted-citrus/ · https://vinepair.com/cocktail-college/techniques-acid-adjusting/
- Food↔cocktail pairing: https://chilledmagazine.com/tutorials/pairing-cocktails-with-food/ · https://www.wsetglobal.com/knowledge-centre/blog/2024/food-and-cocktail-pairing-the-summer-bbq-edition

*Internal artifact note: a research agent extracted the Ahn dataset to `/tmp/fpn/`
during this spike — ephemeral; re-fetch from Zenodo for any real build.*
