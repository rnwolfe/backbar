---
id: task-021
title: Verify rapid sweep inventory, filter, and shopping behavior
status: done
priority: med
estimate: medium
created: 2026-06-30T02:18:02.381Z
updated: 2026-06-30T04:08:03.526Z
labels:
  - feature-plan-task
sourcePlanId: si2b4s6gktmw3lko08yaaje9
---

## Acceptance

- [ ] A server test verifies that sweep filter criteria return only the expected bottles in the sweep list.
- [ ] A server test verifies that a quarter-level sweep update creates an append-only manual reading and updates the derived bottle level.
- [ ] A server test verifies that empty/gone creates a zero-level manual reading and surfaces the newly empty item to the shopping list.
- [ ] A component or integration test covers selecting a sweep filter, choosing a fractional fill level, and advancing to the next bottle.

## Notes

Emitted by feature plan si2b4s6g: "A rapid inventory update flow. The user rapidly goes through their bottles and selects fill level. Large buttons for quick tap. Immediately save and proceed to next bottle. On top of fractional fill levels, have a large button for empty/gone and continue."


