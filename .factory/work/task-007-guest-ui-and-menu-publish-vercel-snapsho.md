---
id: task-007
title: Guest UI and menu publish (Vercel snapshot or local Caddy)
status: done
priority: med
estimate: medium
created: 2026-05-23T03:32:27.041Z
updated: 2026-05-23T14:36:01.338Z
---

## Acceptance

- [x] Guest UI is a React static build of is_published recipes that are currently makeable, greying/hiding when a key bottle runs dry, with the elegant editorial theme per §5
- [x] POST /menu/publish regenerates and pushes a Vercel snapshot OR is served live via local Caddy reverse-proxy in front of guest routes only (never the operator API), selectable by config per §0/§5
- [x] Guest UI exposes only a lightweight menu filter (search published drinks) and never the command palette per §5.1

## Notes

- `packages/guest-ui` is now a real Vite+React+Tailwind static build (mobile-first
  editorial theme — warm paper palette, system serif display, copper accent).
  No command palette and no global keymap; the only input is a `<input
  type=search>` that filters published drinks by name/family/tag.
- Data source switches at build time via `VITE_GUEST_MODE` (`snapshot` |
  `live`). Snapshot reads `./menu.json` (relative to the bundle), live reads
  `/api/guest/menu` through Caddy. Build is identical; runtime data source
  switch per spec §2.
- Live mode polls the menu every 60s and applies a muted, struck "currently
  unavailable" treatment to items the server flags. Snapshot already filters
  to makeable upstream, so it has nothing to grey.
- `POST /menu/publish` is now mode-aware via `MENU_SERVE_MODE`:
  - `snapshot` (default): writes `menu.json` into `GUEST_MENU_OUT_DIR` (the
    same dir operators point `guest-ui` build output at), and if
    `VERCEL_DEPLOY_HOOK` is set, POSTs to it to trigger a Vercel rebuild.
  - `caddy`: no-op publish; returns `{mode:"caddy", url: GUEST_PUBLIC_URL,
    count}`. The live `GET /guest/menu` endpoint is what guests actually read.
- Caddy fronts only `/api/guest/*` + static assets per the Caddyfile snippet
  in `specs/api.md` §6; the operator API stays unexposed.
- Tests: guest-ui has 15 tests (`menu.ts` grouping/filter/availability,
  `source.ts` payload normalization). Server adds a Caddy-mode publish test.
  Full suite is 171/171 green; every package typechecks.


