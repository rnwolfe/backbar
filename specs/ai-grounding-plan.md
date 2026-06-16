# Plan — Grounding the AI Mixology Agent (tools + descriptors)

> Concrete implementation plan following `specs/ai-grounding-spike.md`. Decision
> locked by the operator: **function-calling tools with strong descriptions**,
> backed by rich ingredient descriptors surfaced into context. The corpus the
> tools/RAG run against is enumerated in `specs/ai-grounding-corpus.md`.

---

## 0. Shape of the change

Move the agent from a single schema-only `generateObject` call to a **bounded
tool-use loop**: the model reasons, calls deterministic mixology tools to check
its work and look up flavor knowledge, then emits the final `GeneratedSpec` via a
terminal tool. **The server re-validates authoritatively** after the loop — the
model calling `check_balance` is for *its* reasoning; the repair loop still has
the final say, preserving "AI is never trusted re: inventory" (now also re:
balance and family).

```
  user brief + inventory + tool descriptions
        │
        ▼
  generateText({ tools, stopWhen: stepCountIs(N) })   ← model calls tools
        │   ├─ flavor_profile / pairing_score / top_pairings / flavor_similar   (knowledge)
        │   ├─ check_balance / compute_dilution / classify_family / shake_or_stir (self-check)
        │   └─ submit_spec(GeneratedSpec)              ← terminal "answer" tool
        ▼
  SERVER authoritative gate: resolve refs → check_balance + makeable in code
        │   pass → return spec
        └── fail → re-prompt once with the specific violation (existing loop shape)
```

The **keystone** is a new **ingredient flavor-profile corpus** (axes +
descriptors + default ABV per ingredient ref). It is what makes balance
*computable* (today `predicted_balance` is the model's guess), and it is the
"strong descriptors" surfaced to the model. Everything else composes on top.

---

## 1. The tool set

All tools live in `packages/server/src/ai/tools/*`, defined with the AI SDK
`tool()` helper (zod params + a strong `description`), thin wrappers over **pure
`packages/core` functions** and **seeded `packages/db` data**. The `description`
is the contract that teaches the model *when* to call each one.

Every ingredient param is `{ ref, amount, unit }` (unit ∈ ml|dash|barspoon|top|each|leaf).
The rows below mirror the **implemented** registry in `packages/server/src/ai/tools/index.ts`.

### Computational tools (pure `core` under the hood — also the server's guardrail)

| Tool | Params | Returns | Description (drafted, model-facing) |
|---|---|---|---|
| `check_balance` | `{ ingredients[], method }` | `{ final_abv, balance{6 axes}, flags{too_hot,too_watery}, ratio_readout, verdict:"ok"\|"revise", issues[] }` | "Verify a draft is actually balanced and correctly strong. Resolves each ingredient's ABV and flavor axes, computes real final ABV after dilution, and flags problems (too hot >30%, too watery <8%, too tart, cloying, over-bitter). Call before submitting; a `revise` verdict means fix the named issue, don't ship it." |
| `compute_dilution` | `{ ingredients[], method }` | `{ pre_dilution_ml, water_ml, final_volume_ml, final_abv }` | "Compute chilling dilution and final strength/volume for a build using the method's calibrated dilution factor. Use to size a drink and confirm it lands in-glass." |
| `classify_family` | `{ ingredients[], method?, claimed_family? }` | `{ root, family, confidence, why, claimed_family, matches }` | "Identify which Cocktail-Codex root a build belongs to (old-fashioned/martini/daiquiri/sidecar/highball/flip) from its structure, and whether it matches the claimed family." |
| `suggest_ratio` | `{ family }` | `{ found, root, family, ratio, roles, skeleton }` | "Get the canonical starting ratio for a family/root (e.g. sour → 60:22:15). Adjust from here for syrup richness and citrus tartness." |
| `shake_or_stir` | `{ ingredients[] }` | `{ method, reason }` | "Decide shake vs stir from the ingredients (citrus/egg/dairy/juice → shake; all-spirit/clear → stir). Use to set or check `method`." |
| `acid_adjust` *(deferred)* | — | — | Core fn `acidToAdd` exists + is tested, but no tool yet — a useful tool needs a per-juice acidity corpus (current/target). Phase 2 follow-up. |

### Knowledge tools (seeded data — the "strong descriptors")

| Tool | Params | Returns | Description (drafted) |
|---|---|---|---|
| `flavor_profile` | `{ ref }` | `{ found, ref, descriptors[], axes{}, typical_abv, intensity, role, notes? }` | "Look up what an ingredient tastes and smells like, how it contributes to each balance axis, its strength, and its structural role. Use to reason about substitutions, pairings, and why a build works." |
| `pairing_score` | `{ a, b }` | `{ score, basis:"co-occurrence"\|"molecular"\|"descriptor"\|"both", shared_descriptors[] }` | "Score how well two ingredients pair. Primary signal is how often they co-appear in real cocktails; a secondary, **exploratory** molecular-overlap signal is included and labeled. High co-occurrence is reliable, molecular-only is a creative gamble." |
| `top_pairings` | `{ ref, n?, in_stock_only? }` | `{ ref, partners:[{ref, score, why}] }` | "Find the best partners for an ingredient, optionally limited to in-stock items. Use to extend a build or find what bridges two ingredients." |
| `flavor_similar` | `{ ref, in_stock_only? }` | `{ ref, alternatives:[{ref, similarity, why}] }` | "Find the closest flavor substitutes for an ingredient (curated swaps first, then profile overlap). Use for one-bottle-away swaps and riffs." |

### Inventory + food-pairing

| Tool | Params | Returns | Description (drafted) |
|---|---|---|---|
| `check_makeable` | `{ refs: string[] }` | `{ makeable, missing[] }` | "Confirm every ingredient resolves to something in stock (product, category, in-stock tag, or freeform pantry item). Inventory is non-negotiable — call before submitting." |
| `score_food_pairing` | `{ dish:{intensity, tastes, cuisine?, descriptors?}, cocktail:{ingredients[], method} }` | `{ score, dimensions{intensity,taste,aroma,cuisine}, why }` | "Score a cocktail against a dish on intensity match, taste interactions (acid cuts fat, etc.), aroma bridges, and cuisine affinity. The `/ai/pair-food` route that drives this is Phase 3." |
| `submit_spec` *(deferred)* | — | — | The terminal "answer tool" for the ideate tool-loop — **not in this PR**; lands with the loop integration (see below). |

> **Terminal `submit_spec` (follow-up):** when the registry is wired into ideate,
> AI SDK `generateText` runs the multi-step tool loop and structured final output
> comes from the model calling `submit_spec` with the `GeneratedSpec` zod schema
> (the "answer tool" pattern) — one agentic call instead of generate-then-reformat.

---

## 2. Core + DB changes (pure-first)

### `packages/core` (pure, unit-tested first — build order rule)
- Extend `balance.ts`: keep existing math; add `ratioFor(family)`, `classifyFamily(ingredients, method)`, `acidToAdd(...)`, and a `flavorSimilarity(a, b)` cosine over axis/descriptor vectors. All pure; resolution of refs → `BalanceIngredient[]` stays in the server (needs DB), passed in.
- New `packages/core/src/pairing.ts`: `pairingScore(profileA, profileB, cooc, molec)` blend; `scoreFoodPairing(dishFeatures, cocktailFeatures, matrices)` (Phase 3). Pure functions over data passed in.
- New `packages/core/src/flavor.ts`: types for `FlavorProfile { ref, descriptors[], axes, typical_abv, intensity, role }`, `RootTemplate`, `TasteMatrix`, validated by zod in `schema.ts`.

### `packages/db` (migrations + repos + seed)
New tables (zod-parsed at ingest, per convention) + a migration `00xx_flavor_grounding.sql`:
- `flavor_profile(ref TEXT PK, ref_type, descriptors JSON, axes JSON, typical_abv, intensity, role, notes)`
- `flavor_pairing(a, b, cooccurrence, molecular, PRIMARY KEY(a,b))`
- `ingredient_substitute(ref, substitute_ref, note)`
- `root_template(root PK, skeleton, method, discriminator, canonical_ratio, derived_families JSON)`
- `taste_interaction(taste_a, taste_b, weight)` and `cuisine_affinity(cuisine, spirit_ref, weight)` *(Phase 3)*
Repos in `repositories.ts`; seed builders in `packages/db/seed/*` (see corpus doc).

### `packages/server/src/ai`
- `tools/*.ts` — one file per tool group; a `buildTools(deps)` that returns the AI SDK tool map (closes over db/inventory).
- `ideate.ts` — swap `generateObject` for `generateText({ tools, stopWhen: stepCountIs(N) })` + terminal `submit_spec`; keep `deps.generate` injectable for tests; **after the loop, run the authoritative server gate** (`resolveBalanceIngredients` → `check_balance` + `evaluate` makeable) and re-prompt once on violation.
- `prompts.ts` — `SYSTEM_BASE` gains a short "Tools" section: when to call which, and the rule "submit only after `check_makeable` and `check_balance` pass." Inject top-N relevant `flavor_profile` descriptors for in-stock ingredients as context (strong descriptors up front; tools for the long tail).
- `routes/ai.ts` — Phase 3: `POST /ai/pair-food` (parse dish → features via model, rank makeable cocktails via `score_food_pairing`, model writes rationale, server validates).

### Build tooling
- `scripts/build-flavor-corpus.ts` — downloads + normalizes external corpora (Ahn, bar-assistant, IBA) into seed files / tables. Idempotent; re-runnable. Network only at build time, never at request time.

---

## 3. Phases (each independently shippable)

### Phase 1 — Make the agent honest *(no external data; only authored corpus A)*
1. Author the **ingredient flavor-profile corpus** (corpus §A) covering our category/tag vocabulary (~120 refs).
2. Core: `classifyFamily`, `ratioFor`, resolution helpers; tests first.
3. Tools: `flavor_profile`, `check_balance`, `compute_dilution`, `classify_family`, `shake_or_stir`, `check_makeable`, `submit_spec`.
4. Convert `ideate.ts` to the tool loop + authoritative server gate.
5. Prompt: tool-use guidance + injected descriptors.
- **Acceptance:** a deliberately too-hot/under-sweet brief is rejected and revised; the returned spec's `balance`/`abv` are *computed*, not self-reported; existing tests stay green; new core + tool tests pass.

### Phase 2 — Pairing as suggestion *(corpora B–E)*
1. Build script ingests Ahn molecular table + co-occurrence from canon; expand canon (IBA MIT) + substitutes (bar-assistant MIT).
2. Tools: `pairing_score`, `top_pairings`, `flavor_similar`, `suggest_ratio`, `acid_adjust`.
3. Wire `flavor_similar` into riff + shopping-muse "one bottle away."
- **Acceptance:** `pairing_score(gin, lime)` high via co-occurrence; `flavor_similar(rye)` → bourbon in stock; molecular results labeled exploratory; canon count up.

### Phase 3 — Food pairing *(corpora F–G, the differentiator)*
1. Seed `root_template`, `taste_interaction`, `cuisine_affinity`.
2. Core `scoreFoodPairing`; tool `score_food_pairing`; route `POST /ai/pair-food`.
3. Optional `H` descriptor RAG for narration (own descriptors only).
- **Acceptance:** "pair a cocktail with grilled salmon" returns ranked makeable drinks with a rule-grounded "why"; all validated against inventory + balance.

---

## 4. Guardrails & conventions preserved
- **AI never trusted:** the model's tool calls inform *its* draft; the server independently recomputes `check_balance` + `evaluate` makeable before returning. Re-prompt on violation (existing loop).
- **`core` stays pure/IO-free:** all DB resolution happens in the server; core functions take resolved data.
- **Zod at every boundary:** tool params, tool results, seed rows, corpus ingest.
- **Copyright doctrine:** only CC-BY/MIT/CC0/ODbL sources are bundled; NonCommercial sources are reference-only; no book prose. See corpus doc licensing column.
- **Tests first in `core`**, then tool tests with injected data, then the ideate loop with a fake model.

---

## 5. Open choices folded in (from spike §7)
- **Tool-calling:** chosen (this plan).
- **Adventurousness:** `pairing_score` returns co-occurrence as primary + molecular labeled exploratory; expose a future `mode:"adventurous"` that up-weights molecular.
- **Food-pairing input:** free-text dish (model parses to features) is the Phase-3 default; cuisine picker is a thin add-on.
- **Licensing posture / normalization:** confirmed in the corpus doc; partial slug coverage degrades gracefully (tools return "unknown" rather than failing the generation).
