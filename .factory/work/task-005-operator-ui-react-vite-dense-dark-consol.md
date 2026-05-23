---
id: task-005
title: Operator UI (React+Vite dense dark console) with ⌘K command palette
status: done
priority: med
estimate: large
created: 2026-05-23T03:32:27.035Z
updated: 2026-05-23T04:40:57.015Z
---

## Acceptance

- [x] React + Vite + Tailwind dense dark console renders catalog, bottles, recipes, makeability, low-stock/shopping list, and a node-health panel, wired to WS /live per §5
- [x] ⌘K / Ctrl+K palette is app-wide, opens from the top-bar search, closes on Esc, and unifies entities (products, bottles, recipes, nodes) and commands in one ranked list per §5.1
- [x] Command registry matches the Command interface in §5.1 (id, title, group, keywords, icon, argKind, run) and supports the two-step argKind flow (e.g. Log pour → pick recipe → pour-confirm prefilled from /makeable)
- [x] Scoping prefixes `>`, `@`, `#` work; ↑/↓ move, ↵ select, ⌘↵ secondary action, focus-trapped with aria listbox per §5.1
- [x] Fuzzy search runs client-side over already-loaded stores hydrated via REST and patched by WS /live per §5.1

## Notes

- Stack: React 18 + Vite 5 + Tailwind 3; Bun runs the toolchain. `bun run --filter operator-ui dev`
  proxies `/api` and `/live` at `localhost:8787`.
- Single store via `useSyncExternalStore` (`src/store/useStore.ts`); hydrate on mount,
  patch from WS, refetch shopping list on `lowstock.crossed`. Reconnect uses exponential backoff.
- Command registry in `src/palette/registry.ts` matches the spec interface exactly. Built-ins
  registered from `src/palette/commands.ts`; views can call `register()` at import time to add more.
- Palette implements three screens (`list` / `arg` / `pour-confirm`) inside one overlay; focus-trapped,
  `role=listbox`, `aria-activedescendant` wired to the cursor.
- `specs/ui-operator.md` written from spec §5/§5.1 (per AGENTS.md "generate from spec section if missing").
- `bun test`: 138 pass (added `test/fuzzy.test.ts`). `bun run typecheck` + `bun run build` clean.


