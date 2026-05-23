---
id: task-005
title: Operator UI (React+Vite dense dark console) with ⌘K command palette
status: ready
priority: med
estimate: large
created: 2026-05-23T03:32:27.035Z
updated: 2026-05-23T03:32:27.035Z
---

## Acceptance

- [ ] React + Vite + Tailwind dense dark console renders catalog, bottles, recipes, makeability, low-stock/shopping list, and a node-health panel, wired to WS /live per §5
- [ ] ⌘K / Ctrl+K palette is app-wide, opens from the top-bar search, closes on Esc, and unifies entities (products, bottles, recipes, nodes) and commands in one ranked list per §5.1
- [ ] Command registry matches the Command interface in §5.1 (id, title, group, keywords, icon, argKind, run) and supports the two-step argKind flow (e.g. Log pour → pick recipe → pour-confirm prefilled from /makeable)
- [ ] Scoping prefixes `>`, `@`, `#` work; ↑/↓ move, ↵ select, ⌘↵ secondary action, focus-trapped with aria listbox per §5.1
- [ ] Fuzzy search runs client-side over already-loaded stores hydrated via REST and patched by WS /live per §5.1

## Notes

(agent-maintained)

