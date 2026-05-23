---
id: task-006
title: AI mixology engine and recipe photo import
status: ready
priority: med
estimate: large
created: 2026-05-23T03:32:27.038Z
updated: 2026-05-23T03:32:27.038Z
---

## Acceptance

- [ ] packages/server/ai uses Vercel AI SDK generateObject via AI Gateway with AI_GATEWAY_API_KEY bootstrapped from ~/.ai_gateway_api_key per §0/§3
- [ ] System prompt grounds the model in balance axes (sweet|sour|bitter|strong|aromatic|dilution), Codex root families/ratios, Liquid Intelligence dilution/temp/ABV math, and service (glass/ice/garnish) per §3
- [ ] Output Zod schema returns { name, family, ingredients[], method, ratios, glass, ice, garnish, predicted_balance, abv_estimate, rationale, risk_note } and every ingredient maps to an in-stock product_id or category per §3
- [ ] Inventory repair validates AI output vs live /makeable and either re-prompts or routes to one-bottle-away — never silently substitutes — per §3 and execution notes
- [ ] Modes implemented: make now (strict), riff on [recipe] (rotate one axis), shopping muse (greedy coverage by unlock count) per §3
- [ ] POST /recipes/import-photo accepts an image, uses vision via Gateway to produce a recipe matching the Zod schema, writes with source='photo-import' and provenance='photo:<hash>' per §3

## Notes

(agent-maintained)

