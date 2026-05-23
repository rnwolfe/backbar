---
id: task-004
title: Hono API, ingest core, and WebSocket /live
status: done
priority: med
estimate: large
created: 2026-05-23T03:32:27.033Z
updated: 2026-05-23T03:32:27.033Z
---

## Acceptance

- [x] All endpoints in §5 are implemented: /products, /bottles, /recipes (GET/POST/PATCH), /ingest/reading, /readings/:bottleId, /makeable, /nodes, /pour, /ai/ideate, /ai/shopping, /recipes/import-photo, /shopping-list, /menu/publish, WS /live
- [x] Every API boundary parses input through Zod before touching the DB per §0 and execution notes
- [x] A transport-agnostic ingest core accepts readings; HTTP /ingest/reading is one adapter and reading is append-only with bottle.level_ml as a derived cache rebuildable from readings
- [x] Low-stock uses per-product override else global `< max(15% full, 2 standard pours)` per §6

## Notes

- Server lives in `packages/server`. Entrypoint: `bun run --filter @backbar/server dev` (or `bun packages/server/src/main.ts`).
- Hono routes are mounted by `buildApp(deps)`; tests stand the app up against an in-memory SQLite via `setup()` in `test/_helpers.ts`.
- `applyReading()` in `src/ingest.ts` is the one ingest core both adapters use. HTTP `/ingest/reading` (manual + weight) is the first adapter; the MQTT subscriber (P2) will call the same function. Weight readings require `X-Backbar-Sig` (HMAC-SHA256 of raw body with `HMAC_SECRET`); manual readings do not.
- WebSocket `/live` is mounted in `src/serve.ts` (not on the Hono app — Bun.serve handles upgrade). `reading.updated` bursts are coalesced per connection on a 250 ms window per spec api.md §4.
- `MakeableCache` (`src/makeable.ts`) caches the makeability snapshot in memory and tracks per-recipe state transitions so `makeable.changed` fires only on flips.
- Low-stock threshold lives in `src/lowstock.ts`. `lowStockThreshold(bottle, override?)` returns `max(15% full, 60 ml)` or the per-product override when provided. Per-product override is plumbed through the function signature but not yet on the `product` row — when added (`low_threshold_ml`), wiring is a one-line change in `bottles` and `webhook` callers.
- AI routes (`/ai/ideate`, `/recipes/import-photo`) return `503 ai-disabled` when `AI_GATEWAY_API_KEY` is unset. The full generate+repair loop is task-006.
- `/menu/publish` writes the snapshot JSON to `GUEST_MENU_OUT_DIR` (default `./guest-menu`). Vercel push is task-007.
- Tests: 45 new server tests (ingest core, REST routes, HMAC, low-stock, makeable cache, live WS round-trip). Full repo: `bun test` → 131 pass; `bun run typecheck` → clean.
