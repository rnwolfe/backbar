---
id: task-014
title: Commit confirmed candidates to inventory
status: done
priority: med
estimate: medium
created: 2026-06-11T08:01:57.975Z
updated: 2026-06-11T08:54:18.162Z
labels:
  - feature-plan-task
---

## Acceptance

- [ ] Confirming writes new products (slug ids) and/or bottles (UUIDv7) through existing repositories, reusing the standard creation path — no bespoke insert logic
- [ ] Confirmed inputs are re-validated with Zod at the write boundary
- [ ] When an observed fill was confidently read and the operator kept it, an initial level reading (source: manual) is appended for the bottle; otherwise no reading is written
- [ ] A bottle created this way is immediately visible in the catalog and emits the same live WS update as a manually added bottle

## Notes

Emitted by feature plan gq2ogqj7: "Support bulk import of inventory from images (multiple at once). Each image should be given to a visual reasoning capable model with the intent of identifying any bottles, extracting the specific bottle, shaping it to match our schemas, etc."


