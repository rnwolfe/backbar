---
id: task-018
title: Add server support for filtered sweep listing and rapid level saves
status: done
priority: med
estimate: medium
created: 2026-06-30T02:18:02.364Z
updated: 2026-06-30T04:10:00.000Z
labels:
  - feature-plan-task
sourcePlanId: si2b4s6gktmw3lko08yaaje9
---

## Acceptance

- [ ] An API path accepts sweep filter criteria and returns an ordered bottle list with bottle, product, category, and display metadata required by the operator UI.
- [ ] An API path accepts either a quarter fill level or empty/gone action and validates the request with Zod before touching the database.
- [ ] Saving a quarter fill level creates an append-only manual reading and updates the derived bottle level consistently with existing inventory behavior.
- [ ] Saving empty/gone creates the zero-level reading and creates or updates the shopping-list signal for later operator review.

## Notes

Emitted by feature plan si2b4s6g: "A rapid inventory update flow. The user rapidly goes through their bottles and selects fill level. Large buttons for quick tap. Immediately save and proceed to next bottle. On top of fractional fill levels, have a large button for empty/gone and continue."

