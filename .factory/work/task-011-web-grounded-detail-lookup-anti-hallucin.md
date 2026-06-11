---
id: task-011
title: Web-grounded detail lookup (anti-hallucination enrichment)
status: done
priority: med
estimate: large
created: 2026-06-11T08:01:57.959Z
updated: 2026-06-11T08:31:57.417Z
labels:
  - feature-plan-task
---

## Acceptance

- [ ] For each candidate, a grounded lookup (web search / tool-use grounding) resolves authoritative product details — brand/distillery, category, ABV, bottle size, origin — keyed off the observed name + specific version
- [ ] Grounded values are only filled when the source confidently supports them; unresolved fields stay null (no guessing)
- [ ] Each grounded field carries provenance (source reference) so the operator can see where a detail came from in review
- [ ] The lookup degrades gracefully — a failed or empty grounding leaves the candidate with observed-only fields, never crashes the batch

## Notes

Emitted by feature plan gq2ogqj7: "Support bulk import of inventory from images (multiple at once). Each image should be given to a visual reasoning capable model with the intent of identifying any bottles, extracting the specific bottle, shaping it to match our schemas, etc."


