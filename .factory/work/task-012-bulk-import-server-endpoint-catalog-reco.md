---
id: task-012
title: Bulk import server endpoint + catalog reconciliation
status: done
priority: med
estimate: large
created: 2026-06-11T08:01:57.964Z
updated: 2026-06-11T08:36:19.333Z
labels:
  - feature-plan-task
---

## Acceptance

- [ ] A new POST endpoint accepts multiple images in one request, runs each through vision → grounding, and returns a flat list of candidate drafts tagged with source image index/id and confidence
- [ ] Each candidate is reconciled against existing catalog products and flagged 'existing product → add bottle' or 'new product'; reconciliation only annotates, performs no DB writes
- [ ] Per-image failures are isolated — one unreadable image does not fail the whole batch; failures are reported per-image
- [ ] Endpoint 503s cleanly when AI_GATEWAY_API_KEY is absent, consistent with existing AI routes

## Notes

Emitted by feature plan gq2ogqj7: "Support bulk import of inventory from images (multiple at once). Each image should be given to a visual reasoning capable model with the intent of identifying any bottles, extracting the specific bottle, shaping it to match our schemas, etc."


