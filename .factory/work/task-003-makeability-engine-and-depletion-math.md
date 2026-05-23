---
id: task-003
title: Makeability engine and depletion math
status: ready
priority: med
estimate: medium
created: 2026-05-23T03:32:27.028Z
updated: 2026-05-23T03:32:27.028Z
---

## Acceptance

- [ ] packages/core resolves each recipe ingredient by ref_type (product | category | tag | freeform) and classifies recipes as makeable | one-away | unmakeable per §2
- [ ] Bindings prefer the most-depleted valid bottle (use-it-up, configurable) per §2
- [ ] A pour decrements bottle.level_ml exactly according to the recorded binding and writes a reading with source='pour' per §1/§2
- [ ] Unit→ml conversions use dash≈0.9, barspoon≈5, top≈60, with each/leaf as non-depleting counts per §6

## Notes

(agent-maintained)

