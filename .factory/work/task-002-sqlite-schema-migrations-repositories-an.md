---
id: task-002
title: SQLite schema, migrations, repositories, and canon seed
status: ready
priority: med
estimate: medium
created: 2026-05-23T03:32:27.025Z
updated: 2026-05-23T03:32:27.025Z
---

## Acceptance

- [ ] bun:sqlite migrations create product, bottle, reading (append-only), recipe, recipe_ingredient, pour, sensor_channel, node tables exactly as defined in §1
- [ ] low_stock and shopping_list are implemented as queries/views, not tables, per §1
- [ ] Seed loads layer-1 canon recipes (Old Fashioned, Negroni, Daiquiri, Manhattan, Martini, Margarita, Whiskey Sour, Jungle Bird, Mai Tai, …) and category density defaults from §6
- [ ] IDs follow the convention: catalog = slug, events = UUIDv7

## Notes

- Migrations live under `packages/db/migrations/` — `0001_init.sql` (§1 tables) and `0002_views.sql` (`low_stock`, `shopping_list` as views, not tables).
- Migration runner (`packages/db/src/migrations.ts`) tracks applied versions in `_migrations(version, applied_at)`.
- `reading` is enforced append-only via a `BEFORE UPDATE` trigger that aborts; ON DELETE CASCADE from `bottle` is the only path that removes rows.
- IDs: catalog rows use slug; event rows use UUIDv7 (`packages/db/src/ids.ts`, prefers `Bun.randomUUIDv7()` with a manual fallback).
- Canon seed (`packages/db/seed/canon.ts`) loads the 9 spec-named classics + Gimlet + Sazerac (11 recipes). Idempotent — re-runs skip existing ids.
- Category density defaults from §6 are exposed via `DENSITY_BY_CATEGORY` from `@backbar/core`; the seed re-exports them and the seed report surfaces them so they're observably "loaded".
- Bin scripts: `bun run --filter @backbar/db migrate` and `... seed`. DB path via `BACKBAR_DB` env (default `backbar.db`).
- Tests under `packages/db/test/` cover: migrations apply + idempotency, append-only trigger, low_stock + shopping_list view semantics, canon coverage + idempotent re-seed, UUIDv7 shape.

