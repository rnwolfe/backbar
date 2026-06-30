---
id: task-017
title: Define rapid inventory sweep contract, filter selection, and empty semantics
status: done
priority: med
estimate: medium
created: 2026-06-30T02:18:02.346Z
updated: 2026-06-30T03:38:35.382Z
labels:
  - feature-plan-task
sourcePlanId: si2b4s6gktmw3lko08yaaje9
---

## Acceptance

- [ ] A documented client/server contract defines how the operator starts a sweep from a selected bottle filter, fetches matching bottles, submits quarter-level selections, submits empty/gone, and advances through the filtered list.
- [ ] The contract specifies controls for empty/gone plus 25%, 50%, 75%, and 100% fill levels.
- [ ] The contract states that every saved selection creates a manual reading through the existing append-only inventory pipeline.
- [ ] The contract states that empty/gone records a zero-level manual reading and surfaces the bottle or product to the shopping list without immediately deleting inventory history.

## Notes

Emitted by feature plan si2b4s6g: "A rapid inventory update flow. The user rapidly goes through their bottles and selects fill level. Large buttons for quick tap. Immediately save and proceed to next bottle. On top of fractional fill levels, have a large button for empty/gone and continue."


