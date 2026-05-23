---
id: task-007
title: Guest UI and menu publish (Vercel snapshot or local Caddy)
status: ready
priority: med
estimate: medium
created: 2026-05-23T03:32:27.041Z
updated: 2026-05-23T03:32:27.041Z
---

## Acceptance

- [ ] Guest UI is a React static build of is_published recipes that are currently makeable, greying/hiding when a key bottle runs dry, with the elegant editorial theme per §5
- [ ] POST /menu/publish regenerates and pushes a Vercel snapshot OR is served live via local Caddy reverse-proxy in front of guest routes only (never the operator API), selectable by config per §0/§5
- [ ] Guest UI exposes only a lightweight menu filter (search published drinks) and never the command palette per §5.1

## Notes

(agent-maintained)

