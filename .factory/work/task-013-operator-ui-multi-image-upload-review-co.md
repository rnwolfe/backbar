---
id: task-013
title: "Operator UI: multi-image upload + review/confirm screen"
status: ready
priority: med
estimate: large
created: 2026-06-11T08:01:57.968Z
updated: 2026-06-11T08:01:57.968Z
labels:
  - feature-plan-task
---

## Acceptance

- [ ] Operator can select/drop multiple images at once and submit them as one batch
- [ ] Each detected bottle renders as its own review row showing matched-vs-new status, observed fields (name, version, fill), and grounded details with their source provenance, all editable
- [ ] Operator can edit, discard, or confirm individual candidates before committing; nothing is written until confirm
- [ ] Screen reflows to 375px per the mobile-first invariant (bottom-sheet/bottom-nav pattern)

## Notes

Emitted by feature plan gq2ogqj7: "Support bulk import of inventory from images (multiple at once). Each image should be given to a visual reasoning capable model with the intent of identifying any bottles, extracting the specific bottle, shaping it to match our schemas, etc."

