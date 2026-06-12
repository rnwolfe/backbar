# Backbar

**A local-first operating system for your home bar.** Track every bottle,
log every pour, project a menu to guests in real time, and have an AI
help you riff on what to make with what's actually on the shelf.

Backbar runs entirely on your own hardware. No cloud accounts, no
inventory uploaded anywhere, no subscriptions. The only outbound calls
are the ones you opt into — an AI gateway for the mixology features, a
webhook for low-stock pings, a Vercel deploy hook if you want to host
the guest menu there.

> Status: actively used at home; pre-1.0 and moving. Software ships end-
> to-end with **zero hardware** — the optional load-cell shelf is a
> feature flag away when you're ready.

---

## What it does

**Two surfaces, one source of truth.**

The **operator console** is dense and dark, designed to live on a tablet
behind the bar. Bottles, recipes, pours, the catalog, the guest menu —
all live, all keyboard-friendly. ⌘K opens a global command palette so
you can navigate, pick a bottle, or log a shot without lifting your
hands.

The **guest menu** is the opposite — editorial typography on a warm paper
background, mobile-first, read-only, designed to feel printed. It shows
exactly the drinks you can pour right now, filtered automatically from
the inventory.

Sharing a single recipe, product, or bottle profile is one click; the
operator UI copies a public URL backed by sanitized read-only endpoints
on the guest origin. Bottle share pages show a coarse fullness bucket,
never the exact level.

**Inventory is honest.** Every level observation is an append-only
`reading` with a `source: manual | weight | pour`. The current
`bottle.level_ml` is a derived cache — wipe it and it rebuilds from the
event log. Manual entry and pour-based depletion work without any
hardware. The smart shelf, when you wire it up, is just a third source
on the same pipeline.

**Recipes know about your inventory.** Each one is evaluated against the
current shelf — `makeable`, `one bottle away`, or `unmakeable`. Garnishes
and optional ingredients never block makeability. Pour binds to the
most-depleted compatible bottle by default (use it up before opening a
new one). The AI ideation features are constrained against the same
makeable view, so they can't suggest something you can't actually pour.

**A few things that earned their place**

- **Live updates over WebSocket.** Pour from your phone, watch the
  bottle level change on the tablet without a refresh.
- **Quick pour from any bottle.** Half / 1 oz / 1½ oz / custom — log
  a manual pour in two taps from the bottle detail card, or from the
  palette with `Cmd-K → @bottle-name → Log shot`.
- **AI mixology with grounding.** "Surprise me" ideation, a shopping
  muse that ranks un-owned products by how many recipes they'd unlock,
  and a photo-import flow that OCRs a book page or scrap into a recipe
  draft. All structured-output through Zod schemas; the model never
  silently substitutes an ingredient.
- **Operator-toggleable feature flags.** Live-broadcast over WebSocket
  so flipping a switch on one client updates every connected device.
- **Category management.** Edit labels, hues, and sort order from
  Settings; the palette and rails reflect changes immediately.
- **Mobile-first.** Both UIs reflow to 375px. The operator console
  uses a bottom-nav + bottom-sheet pattern; the guest menu has always
  been mobile-first.

---

## Screenshots

> _(operator + guest screenshots go here — coming soon)_

---

## Architecture

```
┌──────────────────┐      ┌────────────────────┐
│  operator-ui     │      │   guest-ui         │
│  React + Vite    │◀────▶│   React + Vite     │
│  dense · dark    │ /api │   editorial · light│
└────────┬─────────┘      └─────────┬──────────┘
         │                          │
         │      WebSocket + HTTP    │ HTTP (public read)
         ▼                          ▼
  ┌─────────────────────────────────────────────┐
  │  server (Bun + Hono)                        │
  │  REST · /live WS · /menu/publish · /pour    │
  │  /ai/{ideate,shopping,product-lookup,...}   │
  │  /guest/{menu,recipes,products,bottles}/:id │
  └────────┬────────────────────────────────────┘
           │
           │   pure functions (no IO)
           ▼
  ┌────────────────────┐      ┌───────────────────┐
  │  core              │      │  db               │
  │  types · zod       │      │  bun:sqlite       │
  │  makeability       │      │  migrations       │
  │  balance · units   │      │  repositories     │
  └────────────────────┘      └───────────────────┘

  optional:
  ┌────────────────────┐      ┌───────────────────┐
  │  ESP32 fleet       │─MQTT─▶│  mqtt subscriber  │
  │  HX711 load cells  │      │  → ingest core    │
  └────────────────────┘      └───────────────────┘
```

**Local-first.** SQLite on disk (`backbar.sqlite`). One Bun process
serves the API + WebSocket + MQTT subscriber. The guest UI is either a
static snapshot baked at publish time, or a live read from `/guest/menu`
fronted by Caddy — your call.

**Pure core.** `packages/core` has zero IO. Types, Zod schemas, the
makeability algorithm, the balance math, unit conversions — all pure
functions, all unit-tested. Every package downstream is a thin layer
over that.

**Zod at every boundary.** HTTP body, MQTT payload, AI output,
photo-import result, even the migration seed — parsed before they touch
the DB. The AI is _never trusted_ regarding inventory: any spec it
generates is validated against the live makeable set; on a violation we
re-prompt with the offending ingredient or route to a "one-bottle-away"
suggestion.

---

## Quick start

You need [Bun](https://bun.sh/) (≥ 1.3) and Node-compatible TypeScript.

```bash
git clone https://github.com/<you>/backbar.git
cd backbar
bun install

# (Optional) set up env for the AI and webhook bits — see .env.example
cp .env.example .env
$EDITOR .env

# Run migrations + seed the starter bar (canon products + recipes)
bun run --filter @backbar/db migrate
bun run --filter @backbar/db seed

# Fire everything up: server (8787), operator UI (5173), guest UI (5174)
bun run dev
```

Then:

- Operator console: <http://localhost:5173>
- Guest menu: <http://localhost:5174>
- API: <http://localhost:8787>

Both UIs are exposed on `--host` by default, so you can hit them from
your phone on the same LAN. If you want a real HTTPS URL on your home
lab, point Caddy at the server's `/guest/*` namespace and the static
guest-ui bundle (Caddy mode in `packages/server/src/routes/menu.ts`).

### Tests + typecheck

```bash
bun test
bun run typecheck
```

The `core` package's tests are the first thing to run — every other
package builds on its math. The full suite is ~260 tests across the
workspace.

### Releases

The root `package.json` is the single project version source. Releases are
cut locally from conventional commits with `bun run release` and documented
in `CHANGELOG.md`; see [RELEASING.md](RELEASING.md) for the full workflow and
recovery steps.

---

## Project layout

```
backbar/
├── packages/
│   ├── core/          pure types + zod + makeability + balance + units
│   ├── db/            bun:sqlite migrations + repositories + canon seed
│   ├── server/        Hono REST + /live WS + MQTT subscriber + AI
│   ├── operator-ui/   dense dark Console (React + Vite + Tailwind)
│   ├── guest-ui/      editorial paper Menu (React + Vite + Tailwind)
│   └── firmware/      ESP32-S3 fleet node (PlatformIO)
├── specs/             authoritative architecture + per-area specs
└── .env.example
```

Each `packages/*` is a Bun workspace with its own `package.json`. The
root `bun run dev` fans out via `--filter '*' dev`.

The `specs/` directory is the source of truth for non-obvious decisions —
the data model, calibration math, API contracts, integration interfaces.
If something feels surprising in the code, the answer is probably there.

---

## Configuration

`.env` lives next to the root `package.json` (gitignored). The relevant
keys, in roughly the order you'll care about them:

| Key                       | What it does                                                                    |
| ------------------------- | ------------------------------------------------------------------------------- |
| `AI_GATEWAY_API_KEY`      | Vercel AI Gateway key. Without it the AI features 503; everything else works.   |
| `MQTT_URL`                | Local Mosquitto for the smart-shelf fleet. Optional; off by default.            |
| `HMAC_SECRET`             | Required for HTTP `/ingest/reading`. Firmware signs payloads with it.           |
| `WEBHOOK_URL`             | Generic webhook for low-stock / node-offline alerts. ntfy / Discord / Slack.    |
| `MENU_SERVE_MODE`         | `live` (Caddy fronts `/guest/menu`) or `snapshot` (bake JSON for Vercel).       |
| `GUEST_PUBLIC_URL`        | The URL guests visit. Surfaced in publish responses + share links.              |
| `VITE_GUEST_BASE_URL`     | Override the guest origin baked into operator-UI share buttons.                 |
| `INVENTORY_IMPORT_MODEL`  | Vision model for bar-photo bottle detection. Default: `openai/gpt-4o`.          |
| `VISION_MODEL`            | Vision model for recipe photo import. Default: `anthropic/claude-sonnet-4`.     |
| `IDEATE_MODEL`            | Model for recipe generation / riff. Default: `anthropic/claude-sonnet-4`.       |
| `LOOKUP_MODEL`            | Model for product metadata enrichment. Default: `anthropic/claude-haiku-4-5`.   |

Full reference in [`.env.example`](./.env.example).

---

## Feature flags

A small set of flags live in code (`packages/server/src/routes/flags.ts`)
and are toggled at runtime from **Settings → Feature flags**. Toggling
emits a WebSocket event so every connected client updates without a
reload. Add a flag = code change; toggle a flag = one tap.

Current flags:

- **`shelf`** _(default off)_ — the smart-shelf screen + calibration
  command. Until your load cells are wired up, manual entry and pour
  subtraction cover the same workflow.

---

## Status & roadmap

**Stable and in daily use**

- Inventory: catalog, bottles, categories, tags
- Recipes + AI ideation + photo import
- Pour logging (recipe-bound and manual "log a shot")
- Guest menu publish (live or snapshot)
- Public share URLs (`/r/:id`, `/p/:id`, `/b/:id`)
- Mobile-first operator + guest UI
- Local DB only, no cloud

**Experimental / behind a flag**

- **Smart shelf.** Per-bottle HX711 load cells, ESP32-S3 nodes over
  MQTT, 2-point calibration with NVS persistence. Firmware lives in
  `packages/firmware`; flip the `shelf` flag when you're ready.

**Deferred**

- VA ABC procurement lookup (a `ProcurementSource` interface stub is
  in place; turn on with `VA_ABC_ENABLED=true` once it ships).
- Multi-bar / multi-tenant. Probably never — this is a single-bar tool
  by design.

---

## Doctrine

A few principles the codebase tries to hold to:

1. **Local-first.** SQLite + a Bun process. Everything else is opt-in.
2. **Zod at every boundary.** HTTP, MQTT, AI output, seed data —
   validated before it touches the DB.
3. **`reading` is append-only.** `bottle.level_ml` is a derived cache.
   Replay rebuilds it.
4. **Sensing is pluggable.** Manual + pour paths must work standalone;
   weight is a third source on the same ingest core.
5. **AI is never trusted re: inventory.** Generated specs are validated
   against live makeability; no silent substitutions.
6. **Public surfaces are sanitized.** Operator URLs are not safe to
   share; the guest UI is. Bottle shares show a fullness bucket, not
   the exact level.

---

## License

TBD — currently private. Open an issue if you'd like to use it.

---

_Built with [Bun](https://bun.sh/), [Hono](https://hono.dev/),
[React](https://react.dev/), [Vite](https://vitejs.dev/), and a lot of
ice._
