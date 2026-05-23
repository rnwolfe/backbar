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

(agent-maintained)

