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

- [x] packages/core resolves each recipe ingredient by ref_type (product | category | tag | freeform) and classifies recipes as makeable | one-away | unmakeable per §2
- [x] Bindings prefer the most-depleted valid bottle (use-it-up, configurable) per §2
- [x] A pour decrements bottle.level_ml exactly according to the recorded binding and writes a reading with source='pour' per §1/§2
- [x] Unit→ml conversions use dash≈0.9, barspoon≈5, top≈60, with each/leaf as non-depleting counts per §6

## Notes

- AC #1, #2, #4 were already implemented in `packages/core` (makeability.ts, units.ts) as part of task-001 and covered by existing tests in `packages/core/test/`.
- AC #3 (pour application path) was new work for this task:
  - Pure depletion math added in `packages/core/src/pour.ts` — `depletePour()`, `statusAfterDepletion()`, `EMPTY_THRESHOLD_ML`. No IO, throws on over-draw / unknown bottle / negative ml.
  - `packages/db/src/repositories.ts` gained `pours.apply({recipe_id, bindings, made_at})` which, transactionally per binding: writes a `reading{source:'pour'}` with `raw:{recipe_id,pour_id,ml}`, updates `bottle.level_ml`, flips `status='empty'` when the residual drops to ≤ `EMPTY_THRESHOLD_ML` (5 ml). `ml=0` bindings (non-depleting units) are passed through with no IO. Pour row is inserted last so a mid-pour failure leaves no orphan record.
  - Tests: `packages/core/test/pour.test.ts` (pure math) and `packages/db/test/pour.test.ts` (integration: exact decrement, source='pour' reading, ml=0 skip, empty-flip threshold, over-draw atomic rollback, uuidv7 pour id, raw provenance).
- Full suite: 86 pass / 0 fail. Workspace typecheck clean.

