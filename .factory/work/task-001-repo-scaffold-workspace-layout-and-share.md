---
id: task-001
title: Repo scaffold, workspace layout, and shared core types
status: ready
priority: med
estimate: medium
created: 2026-05-23T03:32:27.013Z
updated: 2026-05-23T03:32:27.013Z
---

## Acceptance

- [ ] Bun + TypeScript strict workspace exists with packages/core, packages/db, packages/server, packages/operator-ui, packages/guest-ui, packages/firmware per §7
- [ ] packages/core is pure/IO-free and exports Zod schemas for product, bottle, reading, recipe, recipe_ingredient, pour, sensor_channel, node matching §1
- [ ] Unit/density conversion and balance math helpers in packages/core have unit tests per §6 and execution notes
- [ ] AGENTS.md, specs/, and .env.example (AI_GATEWAY_API_KEY, MQTT_URL, webhook config, hmac secret) are present per §7

## Notes

(agent-maintained)

