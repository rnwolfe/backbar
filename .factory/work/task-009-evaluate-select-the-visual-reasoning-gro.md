---
id: task-009
title: Evaluate + select the visual-reasoning + grounding model (cost/quality de-risk)
status: ready
priority: med
estimate: small
created: 2026-06-11T08:01:57.944Z
updated: 2026-06-11T08:02:40.457Z
labels:
  - feature-plan-task
---

## Acceptance

- [ ] A small recorded sample set of real bar photos (single-bottle and multi-bottle) is run against candidate models available via the AI gateway
- [ ] Each candidate is scored on bottle-detection accuracy, specific-version identification, fill-level reading, and per-image cost/latency; results recorded in the spec/PR
- [ ] The candidate's fitness for web-grounded detail lookup (tool use / search grounding) is assessed alongside vision quality
- [ ] A default model is chosen and set in the AI layer, kept configurable via env/flag so it can change without code edits
- [ ] Decision notes the batching implication: a single multi-bottle photo is one model call covering many products and is preferred over many single-bottle photos

## Notes

Emitted by feature plan gq2ogqj7: "Support bulk import of inventory from images (multiple at once). Each image should be given to a visual reasoning capable model with the intent of identifying any bottles, extracting the specific bottle, shaping it to match our schemas, etc."



