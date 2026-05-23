---
id: task-004
title: Hono API, ingest core, and WebSocket /live
status: ready
priority: med
estimate: large
created: 2026-05-23T03:32:27.033Z
updated: 2026-05-23T03:32:27.033Z
---

## Acceptance

- [ ] All endpoints in §5 are implemented: /products, /bottles, /recipes (GET/POST/PATCH), /ingest/reading, /readings/:bottleId, /makeable, /nodes, /pour, /ai/ideate, /ai/shopping, /recipes/import-photo, /shopping-list, /menu/publish, WS /live
- [ ] Every API boundary parses input through Zod before touching the DB per §0 and execution notes
- [ ] A transport-agnostic ingest core accepts readings; HTTP /ingest/reading is one adapter and reading is append-only with bottle.level_ml as a derived cache rebuildable from readings
- [ ] Low-stock uses per-product override else global `< max(15% full, 2 standard pours)` per §6

## Notes

(agent-maintained)

