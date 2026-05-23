---
id: task-006
title: AI mixology engine and recipe photo import
status: done
priority: med
estimate: large
created: 2026-05-23T03:32:27.038Z
updated: 2026-05-23T14:27:58.397Z
---

## Acceptance

- [x] packages/server/ai uses Vercel AI SDK generateObject via AI Gateway with AI_GATEWAY_API_KEY bootstrapped from ~/.ai_gateway_api_key per §0/§3
- [x] System prompt grounds the model in balance axes (sweet|sour|bitter|strong|aromatic|dilution), Codex root families/ratios, Liquid Intelligence dilution/temp/ABV math, and service (glass/ice/garnish) per §3
- [x] Output Zod schema returns { name, family, ingredients[], method, ratios, glass, ice, garnish, predicted_balance, abv_estimate, rationale, risk_note } and every ingredient maps to an in-stock product_id or category per §3
- [x] Inventory repair validates AI output vs live /makeable and either re-prompts or routes to one-bottle-away — never silently substitutes — per §3 and execution notes
- [x] Modes implemented: make now (strict), riff on [recipe] (rotate one axis), shopping muse (greedy coverage by unlock count) per §3
- [x] POST /recipes/import-photo accepts an image, uses vision via Gateway to produce a recipe matching the Zod schema, writes with source='photo-import' and provenance='photo:<hash>' per §3

## Notes

- AI Gateway wiring: `packages/server/src/ai/gateway.ts` — bootstraps
  `AI_GATEWAY_API_KEY` from `~/.ai_gateway_api_key` (called from `main.ts`),
  exposes `getDefaultModel()` and `getVisionModel()` as
  `gateway('anthropic/claude-sonnet-4')`.
- Deps: `ai@^5.0.190` + `@ai-sdk/gateway@^2.0.91` (gateway 2.x is the
  V2-provider series that matches `ai@5`; 3.x is V3 and ships separately).
- Prompts: `packages/server/src/ai/prompts.ts` — `SYSTEM_BASE` grounds the
  six balance axes, the codex family templates, dilution math (stir
  ~20–25%, shake ~25–30%), service (glass/ice/garnish), and the HARD RULE
  that every `product_ref` MUST appear in the inventory snapshot. The
  snapshot lists `product_id | category | flavor_tags` plus the set of
  valid category tokens.
- Ideate: `packages/server/src/ai/ideate.ts` — generate+repair loop with
  the SDK handling schema retries and a 2-attempt semantic inventory
  check on top. After two off-inventory tries returns
  `{ok:false, reason:"off-inventory"}` — never silently substitutes.
  Modes: `now` (strict), `riff` (template+rotate-one-axis prompt),
  shopping muse handled at the route via `validRefs` override + preview.
- Photo import: `packages/server/src/ai/import-photo.ts` — `generateObject`
  with image content; fuzzy-matches each extracted label against
  product name → contains → token overlap → subcategory → category →
  flavor tag. Unmatched labels stay `freeform`. Draft is returned with
  `source:'photo-import'` and `provenance:'photo:<sha256>'`.
- Routes: `POST /ai/ideate`, `GET /ai/shopping?preview=1` (deterministic
  coverage + optional ideate of the top suggestion), `POST /recipes/
  import-photo`, and `POST /recipes/:id/confirm` for the human-confirm
  save path (rejects bodies missing photo provenance).
- Tests: `packages/server/test/ai.test.ts` covers prompt grounding,
  generate+repair, riff/shopping-muse modes, photo-import fuzzy match,
  and the confirm route. Whole suite: 155/155 green. Typecheck clean.
- `GeneratedSpec` now includes a top-level `ratios: z.string()` field
  (e.g. "2 : 0.75 : 0.75") to mirror the codex family templates that
  ground the prompt; previous runs left it off the schema. The system
  prompt instructs the model to emit it in ingredient order, and a new
  test asserts the schema rejects output missing `ratios`. Detail spec
  `specs/ai-engine.md` updated to match the authoritative architecture
  spec §3 enumeration.



