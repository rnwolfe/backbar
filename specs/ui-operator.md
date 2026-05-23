# specs/ui-operator.md

Detail for `packages/operator-ui`. Parent: spec §5 + §5.1; seed sketch: `operator-ui-seed.jsx` (not yet checked in — the patterns below are normative).

Stack: **React 18 + Vite + Tailwind**, dense dark utilitarian theme. Bun runs the toolchain. No design system; Tailwind utilities + ~6 design tokens (`bg`, `bg-2`, `bg-3`, `fg`, `fg-2`, `accent`). State is plain React hooks behind a single `useStore()` source-of-truth — no Redux / Zustand / etc.

---

## 1. Information architecture

Top bar (sticky):
- **Brand pill** — `BACKBAR ▒` (visual only).
- **Search trigger** — a button that *looks* like an input (`⌘K  search bottles, recipes, commands…`). Click or `⌘K` / `Ctrl+K` opens the command palette (§3).
- **Live status** — WS connection dot + count of online nodes.

Left rail (compact icons + labels) jumps the focus pane:
- Makeability (default landing)
- Catalog (products)
- Bottles
- Recipes
- Shopping (low-stock + muse)
- Nodes

Main pane renders the active view. Right rail is reserved for a future
"now mixing" detail; not required by task-005.

All views render from the **client store** (REST hydrate + WS patch — §2). No view fetches per-render.

## 2. Data flow

```
GET /products, /bottles, /recipes, /makeable, /shopping-list, /nodes
   └─► store.{products, bottles, recipes, makeable, shopping, nodes}
WS /live
   ├─► reading.updated     ─► bottles.level_ml patch
   ├─► makeable.changed    ─► makeable[recipe_id].state patch
   ├─► lowstock.crossed    ─► shopping.low refresh (cheap REST refetch)
   └─► node.status         ─► nodes patch
```

Reconnect with exponential backoff (1s → 30s). On re-open, refetch all (cheap at ~100 bottles).

`POST /pour`, `POST /menu/publish`, etc. fire from commands; on success the store relies on the resulting WS events for visible state, *not* on optimistic local writes (single source of truth = server).

## 3. Command palette (⌘K)

Implements spec §5.1 verbatim. Three-screen state machine inside one overlay:

| Screen | Trigger | Renders |
|---|---|---|
| `list` | open (no argKind active) | ranked mix of entities + commands |
| `arg`  | command with `argKind` selected | only entities of that kind, ranked |
| `confirm` | `pour-confirm` etc. | inline form (pour: recipe + bindings + made_at) |

### Command registry

```ts
interface Command {
  id: string;
  title: string;
  group: "nav" | "inventory" | "recipe" | "ai" | "fleet" | "menu";
  keywords?: string[];
  icon?: string;
  argKind?: "bottle" | "recipe" | "product" | "node";
  run(ctx: AppCtx, arg?: Entity): void | Promise<void>;
}
```

`AppCtx` carries: `api` (REST helpers), `store` (current snapshot), `palette` (open / close / push subscreen), `nav` (set active view).

### Built-in commands (P0)

| id | title | group | argKind | behavior |
|---|---|---|---|---|
| `nav.makeability` | Go to makeability | nav | — | `nav('makeability')` |
| `nav.catalog` | Go to catalog | nav | — | nav |
| `nav.bottles` | Go to bottles | nav | — | nav |
| `nav.recipes` | Go to recipes | nav | — | nav |
| `nav.shopping` | Go to shopping | nav | — | nav |
| `nav.nodes` | Go to nodes | nav | — | nav |
| `inventory.add-bottle` | Add bottle | inventory | `product` | open POST /bottles with product_id prefilled |
| `recipe.log-pour` | Log pour | recipe | `recipe` | open pour-confirm with bindings from cached /makeable |
| `ai.ideate` | Ideate drink | ai | — | POST /ai/ideate (degrades to ai-disabled notice) |
| `menu.publish` | Publish menu | menu | — | POST /menu/publish |
| `fleet.recalibrate` | Recalibrate node | fleet | `node` | nav('nodes') (stub — full flow in task-008) |

The registry is exported from `palette/commands.ts`; **every view contributes** by importing and pushing into the same registry array (one ingest point, easy to grep).

### Scoping prefixes

| prefix | restricts to |
|---|---|
| `>` | commands only |
| `@` | bottles only |
| `#` | recipes + tags |

Empty query: top recent entities + top suggested commands (P0 = a static
shortlist; recency persistence is a later improvement).

### Keyboard

- `⌘K` / `Ctrl+K` — open from anywhere
- `Esc` — close (or back one screen if in `arg`/`confirm`)
- `↑` / `↓` — move selection
- `↵` — primary action (entity → navigate; command → run)
- `⌘↵` — secondary action (entity → "log pour with"; command → variant)

The overlay is focus-trapped; the listbox uses `role="listbox"`, items use
`role="option"` with `aria-selected`. The input has `aria-controls` →
listbox id, and `aria-activedescendant` → currently-selected option id.

### Fuzzy match

Trivial subsequence scorer over already-loaded stores. Score = position-weighted (earlier letters worth more) + boost on whole-word match. Index is rebuilt on each open from the store snapshot (~100 bottles + dozens of recipes; sub-millisecond). Server `GET /search?q=` exists as an escape hatch only; not used in P0.

---

## 4. Files

```
packages/operator-ui/
  index.html
  vite.config.ts
  tailwind.config.js
  postcss.config.js
  src/
    main.tsx
    App.tsx
    index.css
    api/
      client.ts        # REST helpers (typed) + apiBase()
      ws.ts            # WS /live client w/ reconnect
    store/
      useStore.ts      # single hook, holds + patches store
    palette/
      Palette.tsx      # overlay, listbox, screens
      registry.ts      # Command interface + register()/list()
      commands.ts      # built-in commands
      fuzzy.ts         # subsequence scorer
      pour-confirm.tsx # inline confirm screen for `recipe.log-pour`
    views/
      Catalog.tsx
      Bottles.tsx
      Recipes.tsx
      Makeability.tsx
      Shopping.tsx
      Nodes.tsx
    layout/
      Layout.tsx       # top bar + side rail
      TopBar.tsx
      NavRail.tsx
```

## 5. Acceptance ↔ files

- All views render from store + WS — `useStore.ts`, `api/client.ts`, `api/ws.ts`, `views/*.tsx`.
- ⌘K app-wide, top-bar trigger, Esc close, unified ranked list — `Palette.tsx`, `TopBar.tsx`.
- Command interface + two-step argKind flow — `registry.ts`, `commands.ts`, `pour-confirm.tsx`.
- Scoping prefixes + keyboard + aria — `Palette.tsx`.
- Client-side fuzzy over loaded stores — `fuzzy.ts`, `Palette.tsx`.
