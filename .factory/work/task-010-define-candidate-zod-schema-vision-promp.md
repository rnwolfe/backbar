---
id: task-010
title: Define candidate Zod schema + vision prompt (observe, don't invent)
status: ready
priority: med
estimate: medium
created: 2026-06-11T08:01:57.953Z
updated: 2026-06-11T08:01:57.953Z
labels:
  - feature-plan-task
---

## Acceptance

- [ ] A Zod schema in packages/server/ai (e.g. extractedBottle) captures observed fields — display name, specific version/expression, and observed fill (a coarse bucket or null) — plus per-detection confidence, and placeholder slots for grounded details (brand/distillery, category, size_ml, abv) that start null
- [ ] The vision prompt instructs the model to report ONLY what is visible (identity, version, fill) and to leave authoritative details null for the grounding step rather than guessing
- [ ] The prompt returns one entry per distinct bottle visible in a single image (each its own product candidate) as a structured array
- [ ] Model output is parsed through the schema before leaving the AI layer; a parse failure triggers the existing repair/re-prompt loop rather than crashing
- [ ] Unit test feeds a recorded/sample model response and asserts it validates (or repairs) to the schema

## Notes

Emitted by feature plan gq2ogqj7: "Support bulk import of inventory from images (multiple at once). Each image should be given to a visual reasoning capable model with the intent of identifying any bottles, extracting the specific bottle, shaping it to match our schemas, etc."

