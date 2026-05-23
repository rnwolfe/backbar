# Project Decisions

## Bootstrap (2026-05-23T03:32:27.006Z)

Project created from idea c3nycqecltq1z69urxs8jwj1 via decision ni0bldsmiblgnenjwsburzka.

Idea text:

> backbar
> 
> # Backbar — Architecture Spec v0.5
> 
> > Working name. *Backbar* = the shelving behind a bar where bottles sit — which is also the thing we're sensing. Rename freely.
> 
> Local-first home-bar operating system: inventory + depletion + recipes + AI mixology, projecting a public guest menu. Novel layer: a per-bottle load-cell "smart shelf" that measures remaining volume by weight. Scale target: **~100+ bottles**.
> 
> **Changelog v0.4 → v0.5:** Added §5.1 — first-class **command palette + global search (⌘K)** as an app-wide primitive: client-side fuzzy over loaded stores, an extensible command registry every view contributes to, scoping prefixes, and command→argument flows.
> 
> **Changelog v0.3 → v0.4:** Added §10 future integrations — **Virginia ABC** local stock/price lookup as a deferred, isolated `procurement-source` adapter (unofficial endpoints; personal use). Ships alongside `AGENTS.md` + repo scaffold + an operator-UI seed (`operator-ui-seed.jsx`).
> 
> **Changelog v0.2 → v0.3:** Scale corrected to 100+ bottles ⇒ the shelf is a **multi-node ESP32 fleet**, not one device. Hardware transport = **MQTT** (broker on home box) for the fleet + **HTTP** retained for manual/UI; both feed one transport-agnostic ingest core. Added node topology + node-density fork. Added **hybrid tracking** (load-cell the workhorses, manual the long tail) as the default rollout. Nothing above the transport layer changes — software scales to 100 bottles unmodified.
> 
> **Changelog v0.1 → v0.2:** AI = Vercel AI SDK + AI Gateway. Notifications = generic webhooks. Guest hosting = Vercel snapshot **or** local Caddy. Vision label-ID dropped. Added recipe-photo import. AI suggests glass/ice/garnish. Seed strategy clarified.
> 
> ---
> 
> ## 0. Decisions (locked)
> 
> | Area | Decision | Why |
> |---|---|---|
> | Runtime | **Bun** | TS-native, fast, single toolchain incl. `bun:sqlite` and test runner |
> | Language | **TypeScript, strict** | — |
> | DB | **`bun:sqlite`** (single file, local-first) | Zero-dep embedded; 100 bottles is nothing. libsql is the upgrade path only if remote sync is later wanted |
> | API/router | **Hono** | Tiny, TS-first, runs on Bun and edge |
> | Validation | **Zod** at every boundary | API, MQTT/HTTP payloads, AI output, recipe import |
> | IDs | catalog = **slug**; events = **UUIDv7** | deterministic where natural, sortable where temporal |
> | Operator UI | **React + Vite + Tailwind**, dense dark | utilitarian console |
> | Guest UI | same React workspace, **static snapshot**, elegant theme | one framework, two surfaces |
> | Guest hosting | **Vercel snapshot** (default) **or local Caddy reverse-proxy** | snapshot for off-site; Caddy when serving live from home (guest routes only) |
> | AI | **Vercel AI SDK** via **Vercel AI Gateway** | `generateObject` = native Zod structured output + repair; vision for recipe import |
> | AI key | `~/.ai_gateway_api_key` → `.env` `AI_GATEWAY_API_KEY` | per host; never committed |
> | **Hardware transport** | **MQTT** (broker on home box) for the node fleet; **HTTP POST `/ingest/reading`** retained for manual/UI + fallback | 100 bottles ⇒ multi-node fleet. MQTT gives node birth/last-will health, retained state, config/cal push. Both feed one transport-agnostic ingest core (§4) |
> | Notifications | **generic webhook adapter** (templated URL + payload) | drives ntfy/Pushover/Discord/Slack; zero lock-in |
> 
> **Core invariant:** sensing method is *pluggable*. Every level observation is a `reading { source: manual | weight | pour }`. The app works fully with zero hardware (P0). Hardware is additive, and tracking is **per-bottle opt-in** — some bottles weight-tracked, the rest manual, in the same table.
> 
> ---
> 
> ## 1. Domain model
> 
> `product` (a type/SKU) vs `bottle` (a physical instance with tare weight + slot). You can own multiple bottles of one product.
> 
> ```sql
> product(
>   id            TEXT PRIMARY KEY,        -- slug, e.g. 'beefeater-london-dry'
>   name          TEXT NOT NULL,
>   category      TEXT NOT NULL,           -- gin | bourbon | rum | amaro | vermouth | citrus | syrup | bitters | ...
>   subcategory   TEXT,                    -- rum: jamaican | demerara | agricole | blended-aged (Smuggler's Cove taxonomy)
>   abv           REAL,                    -- 0..1
>   density_g_ml  REAL,                    -- override; else category default (§6)
>   default_ml    INTEGER,
>   flavor_tags   TEXT,                    -- json: ["juniper","citrus","floral"]
>   notes         TEXT
> )
> 
> bottle(
>   id              TEXT PRIMARY KEY,      -- uuidv7
>   product_id      TEXT NOT NULL REFERENCES product(id),
>   slot            TEXT,                  -- maps to a sensor channel; null = untracked (manual)
>   tare_g          REAL,                  -- empty bottle weight (calibration)
>   full_ml         INTEGER NOT NULL,
>   level_ml        REAL NOT NULL,         -- DENORM cache of latest reading
>   status          TEXT NOT NULL,         -- sealed | open | empty | archived
>   tracked         INTEGER NOT NULL DEFAULT 0, -- 1 = weight-tracked, 0 = manual (hybrid rollout)
>   opened_at       INTEGER,
>   purchased_at    INTEGER,
>   price_cents     INTEGER
> )
> 
> reading(                                 -- append-only level observations (pluggable core)
>   id          TEXT PRIMARY KEY,          -- uuidv7
>   bottle_id   TEXT NOT NULL REFERENCES bottle(id),
>   level_ml    REAL NOT NULL,
>   source      TEXT NOT NULL,             -- manual | weight | pour
>   confidence  REAL NOT NULL DEFAULT 1,
>   raw         TEXT,                       -- json: {gross_g,tare_g} | {recipe_id}
>   ts          INTEGER NOT NULL
> )
> 
> recipe(
>   id            TEXT PRIMARY KEY,        -- slug
>   name          TEXT NOT NULL,
>   family        TEXT,                    -- old-fashioned|martini|daiquiri|sidecar|highball|flip|freeform (Codex roots)
>   method        TEXT,                    -- build|stir|shake|swizzle|blend|throw
>   glass         TEXT,                    -- AI-suggested
>   ice           TEXT,                    -- none|cubed|large-format|crushed|pellet (AI-suggested)
>   garnish       TEXT,                    -- AI-suggested
>   instructions  TEXT,
>   source        TEXT,                    -- book | me | ai | photo-import
>   provenance    TEXT,
>   abv_estimate  REAL,
>   balance       TEXT,                    -- json axes {sweet,sour,bitter,strong,aromatic,dilution} 0..1
>   is_published  INTEGER NOT NULL DEFAULT 0,
>   tags          TEXT
> )
> 
> recipe_ingredient(
>   recipe_id   TEXT NOT NULL REFERENCES recipe(id),
>   ref_type    TEXT NOT NULL,             -- product | category | tag | freeform
>   ref_id      TEXT,
>   label       TEXT,
>   amount      REAL,
>   unit        TEXT,                      -- ml | dash | barspoon | each | leaf | top
>   optional    INTEGER DEFAULT 0,
>   garnish     INTEGER DEFAULT 0
> )
> 
> pour(
>   id           TEXT PRIMARY KEY,         -- uuidv7
>   recipe_id    TEXT REFERENCES recipe(id),
>   made_at      INTEGER NOT NULL,
>   bottles_used TEXT                       -- json: [{bottle_id, ml}]
> )
> 
> -- hardware: a channel belongs to a node (device_id) in the fleet
> sensor_channel(
>   device_id   TEXT NOT NULL,             -- ESP32 node id (a shelf section)
>   channel     INTEGER NOT NULL,
>   slot        TEXT NOT NULL,
>   bottle_id   TEXT REFERENCES bottle(id),
>   cal_slope   REAL,                      -- raw counts -> grams (2-point cal)
>   cal_offset  REAL,
>   PRIMARY KEY (device_id, channel)
> )
> 
> -- fleet health, populated from MQTT birth/last-will
> node(
>   device_id   TEXT PRIMARY KEY,
>   label       TEXT,                      -- "back-shelf-left"
>   last_seen   INTEGER,
>   status      TEXT,                      -- online | offline (from LWT)
>   fw_version  TEXT
> )
> ```
> 
> `low_stock` and `shopping_list` are **queries/views, not tables**.
> 
> ---
> 
> ## 2. Makeability engine (`packages/core`, pure, no IO)
> 
> Constraint satisfaction over inventory. Per recipe, for each **required** ingredient resolve candidate bottles by `ref_type` (`product` | `category` | `tag` | `freeform`); ingredient is *satisfiable* if ≥1 candidate has `level_ml ≥ amount_ml` (units via §6). Recipe → **makeable** (all satisfiable; record binding so a pour decrements exactly) | **one-away** (exactly one unsatisfiable; powers guest "coming soon" + shopping muse) | **unmakeable**. Bindings prefer the most-depleted valid bottle (use-it-up, configurable). At 100 bottles × N recipes this is still trivial; precompute on inventory change and cache.
> 
> ---
> 
> ## 3. AI mixology engine (`packages/server/ai`)
> 
> Vercel AI SDK `generateObject` via AI Gateway. The Zod result schema *is* the contract; SDK structured-output + retry absorbs most repair, with an explicit inventory-validation pass on top.
> 
> **Grounding (system prompt):** balance axes `sweet|sour|bitter|strong|aromatic|dilution` (predict 0..1); **Codex root families** (rotate one variable; sour ~2:0.75:0.75, stirred ~2:1, equal-parts 1:1:1, highball ~1:3, OF spirit+~0.25 sweet+2 dash bitters, flip/rich); **dilution/temp** (Liquid Intelligence — predict final ABV + water by method, flag too-hot/too-watery); **service** — choose glass/ice/garnish appropriate to family/method.
> 
> **Inputs:** brief + current inventory (makeable products + tags) + hard constraints (must-use/avoid/glass/ABV/batch N).
> **Output (Zod):** `{ name, family, ingredients[], method, ratios, glass, ice, garnish, predicted_balance, abv_estimate, rationale, risk_note }`. Every ingredient maps to an in-stock product_id or category.
> **Inventory repair:** validate vs live `makeable`; violation → re-prompt with the offending ingredient OR route to "one bottle away" (never silently substitute).
> **Modes:** *make now* (strict) · *riff on [recipe]* (rotate one axis) · *shopping muse* (greedy coverage — count unmakeable recipes each un-owned product unlocks).
> 
> **Recipe photo import (`POST /recipes/import-photo`):** image → `generateObject` (vision via Gateway) → recipe schema → review/confirm → DB (`source='photo-import'`, `provenance='photo:<hash>'`). The legitimate path to bring owned books into the library; ingredient lines map to existing products or flag product creation.
> 
> ---
> 
> ## 4. Smart shelf (hardware fleet, P2 — additive, never blocking)
> 
> **Sensing = weight. Per bottle. Multi-node fleet.** At ~100 bottles you can't wire one MCU; the shelf is **8–12 ESP32-S3 nodes**, each owning a shelf section. Per channel: load cell → ADC → node. `level_ml = (gross_g − tare_g) / density_g_ml`.
> 
> **Node-density fork (decide at P2):**
> - **Many simple nodes** — HX711 per cell, shared SCK clock + per-cell DOUT, ~8–16 cells/node. Cheapest parts, more nodes, more wiring.
> - **Fewer multi-channel nodes** — a multi-channel ADC (e.g. ADS1256, 8-ch) per node, ~16–32 cells/node, 3–6 nodes total. Fewer nodes to manage, pricier ADCs.
> 
> **Transport = MQTT** (broker on the home box; e.g. Mosquitto):
> - Each node publishes settle-detected readings to `backbar/<device_id>/reading`.
> - **Birth + last-will** topics → `node.status` online/offline, so a dropped section is visible (the thing HTTP would force you to hand-roll across a fleet).
> - **Retained** current-state per channel for fast UI hydrate on reconnect.
> - **Config/calibration push** down `backbar/<device_id>/config` — set cal + cadence on all nodes without polling.
> - Server runs an **MQTT subscriber adapter** that normalizes to the ingest core. The **HTTP `/ingest/reading`** endpoint stays for manual/UI readings and as a fallback. *One ingest core, two adapters.*
> 
> **Calibration:** 2-point per channel (empty + known mass) → `cal_slope/offset`. Per bottle: record `tare_g` once.
> **Settle detection (critical):** commit a reading only when weight is stable within ε for N seconds — avoids logging the *act of pouring* as garbage.
> **Cadence:** on-change + heartbeat ~5 min.
> 
> **Hybrid tracking (default rollout):** weight-track the **workhorses** (the 20–30 bottles you actually pour); leave the rare/display long tail as `tracked=0`, `source=manual`. Native to the model — no special-casing. Lets P2 deliver value without fabricating 100 sensing slots up front.
> 
> *(Per-zone cells rejected: ambiguous which bottle changed. Vision used only for recipe import, §3.)*
> 
> ---
> 
> ## 5. Surfaces & deployment
> 
> **Operator (local-first):** Bun server on the home box (OpenClaw host / mini-PC). React+Vite dense dark console. WebSocket `/live` for real-time levels + node health.
> 
> API (Hono):
> ```
> GET/POST/PATCH  /products /bottles /recipes
> POST            /ingest/reading        # manual + HTTP fallback (fleet uses MQTT, §4)
> GET             /readings/:bottleId
> GET             /makeable               # makeable | one-away | unmakeable
> GET             /nodes                  # fleet health (online/offline, last_seen)
> POST            /pour
> POST            /ai/ideate
> GET             /ai/shopping
> POST            /recipes/import-photo
> GET             /shopping-list
> POST            /menu/publish
> WS              /live
> ```
> 
> **Guest:** static build of `is_published` recipes that are **currently makeable** (greys/hides when a key bottle runs dry). Elegant editorial theme. Two serve modes (config): **Vercel snapshot** (`/menu/publish` regenerates + pushes; off-site, no home network exposed) or **local Caddy reverse-proxy** (serve live off inventory; Caddy fronts guest routes only, never the operator API). QR at the bar → menu URL. Optional "I'll have this" → pour intent (P3).
> 
> ### 5.1 Command palette & global search (⌘K)
> 
> First-class and app-wide — the primary way to move and act in the operator console, not a bolt-on. ⌘K / Ctrl+K from any view (the top-bar search box is its trigger; Esc closes). One palette unifies two result kinds under a single ranked list:
> - **Entities** — products, bottles, recipes, nodes. Select → navigate to / open it.
> - **Commands** — actions registered by *any* view: log a pour, ideate a drink, add bottle/product, import recipe photo, publish menu, mark bottle low, recalibrate a node, jump to any section. Select → run; some take a follow-up argument resolved in the same palette.
> 
> **Implementation:** client-side fuzzy over the already-loaded operator stores (recipes/bottles/products/nodes are in memory — hydrated via REST, patched by WS `/live`). Instant, offline, no round-trip per keystroke; at ~100 bottles + dozens of recipes the index is trivial. An optional `GET /search?q=` (api.md) exists only as a future escape hatch if data outgrows the client.
> 
> **Command registry** (extensible — each package contributes its own; mirrors the AGENTS.md router philosophy):
> ```ts
> interface Command {
>   id: string; title: string;
>   group: "nav" | "inventory" | "recipe" | "ai" | "fleet" | "menu";
>   keywords?: string[]; icon?: string;
>   argKind?: "bottle" | "recipe" | "product" | "node";   // if set, palette prompts for the arg first
>   run(ctx: AppCtx, arg?: Entity): void | Promise<void>;
> }
> ```
> Two-step flow when `argKind` is set: pick command → palette re-queries that entity type → run. E.g. "Log pour" → pick recipe → opens pour-confirm with bindings prefilled from `/makeable`.
> 
> **Scoping prefixes** (VS Code-style power use): `>` commands only · `@` bottles · `#` recipes/tags. Empty query → recent entities + top suggested commands.
> **Keyboard:** ↑/↓ move · ↵ select · ⌘↵ secondary action (e.g. open vs. log-pour) · Esc close. Focus-trapped, `aria` listbox.
> **Guest UI** gets a lightweight *menu filter* only (search published drinks) — never the command palette; guests have no actions to expose.
> 
> ---
> 
> ## 6. Defaults (seed)
> 
> Density `g/ml`: spirit@40% 0.95 · spirit@50%+ 0.93 · vermouth/wine 1.00 · amaro/liqueur 1.06–1.12 · simple 1:1 1.22 · rich 2:1 1.30 · citrus 1.03 · water 1.00 (override per product).
> Unit→ml: `dash≈0.9`, `barspoon≈5`, `top≈60`; `each/leaf` = count, non-depleting.
> Low-stock: per-product override else global `< max(15% full, 2 standard pours)`.
> 
> ### Seed strategy (recipes)
> 1. **Canon as facts** — curated classics (Old Fashioned, Negroni, Daiquiri, Manhattan, Martini, Margarita, Whiskey Sour, Jungle Bird, Mai Tai, …) as specs; proportions are facts, not protected expression.
> 2. **Frameworks as engine logic** — methods, not text: Codex (six roots + rotate-one-variable), Liquid Intelligence (dilution/temp/ABV math), Smuggler's Cove (rum subcategory taxonomy + tiki build/ice templates), Death & Co (modern-classic spec shapes + service norms).
> 3. **Bring-your-own** — recipe-photo import (§3) brings the contents of books you own into *your* library, `provenance` recorded.
> 
> Repo ships layers 1–2; layer 3 is user-driven. No bundled scraped book contents.
> 
> ---
> 
> ## 7. Repo layout (workspace + AGENTS.md router)
> 
> ```
> backbar/
>   AGENTS.md
>   specs/
>   .env.example           # AI_GATEWAY_API_KEY, MQTT_URL, webhook config, hmac secret
>   packages/
>     core/                # types, zod, makeability, balance math, unit/density conv (pure)
>     db/                  # bun:sqlite, migrations, repositories, seed (canon)
>     server/              # Hono API + WS + ingest core + mqtt adapter + ai/
>     operator-ui/         # React+Vite dense dark console (+ node-health panel)
>     guest-ui/            # React static elegant menu
>     firmware/            # ESP32-S3 fleet node: ADC read + settle + MQTT pub/sub (PlatformIO)
> ```
> 
> `AI_GATEWAY_API_KEY` bootstrapped from `~/.ai_gateway_api_key`; `MQTT_URL` points at the local broker. Keys never committed.
> 
> ---
> 
> ## 8. Phasing
> 
> | Phase | Scope | Hardware |
> |---|---|---|
> | **P0** | catalog, manual + pour depletion, recipe library + canon seed, makeability, operator UI, low-stock + shopping list | none |
> | **P1** | AI ideate (+glass/ice/garnish) + shopping muse, recipe-photo import, guest menu (Vercel or Caddy) | none |
> | **P2a** | broker + one ESP32 node + ingest/MQTT adapter + calibration + settle detection + node-health UI + webhook alerts | 1 node |
> | **P2b** | scale out the fleet to cover the workhorse bottles (hybrid), then long tail as desired | fleet |
> | **P3** | guest "I'll have this" → pour intent; optional shelf imagery | optional camera |
> 
> P0+P1 ship the entire software loop with zero hardware. P2 lands on **one node first** to prove calibration/settle/MQTT end-to-end before fabricating the fleet; hybrid tracking means you never *have* to wire all 100.
> 
> ---
> 
> ## 9. Resolved
> 1. Guest hosting → Vercel snapshot + Caddy option (§5).
> 2. ~~MQTT not used~~ → **MQTT for the node fleet** (100 bottles = multi-node) + HTTP for manual/fallback (§4). *Reversed in v0.3.*
> 3. Load-cell form factor → per-bottle (§4); node-density fork open until P2.
> 4. Notifications → generic webhook (§0).
> 5. Recipe seed → canon-as-facts + frameworks-as-logic + photo import (§6).
> 
> No open questions blocking P0/P1.
> 
> ---
> 
> ## 10. Future integrations (deferred, P3+)
> 
> ### Virginia ABC — local stock & price (`packages/server/integrations/va-abc`)
> Closes the loop from `shopping-list` / shopping-muse to *actually buy it locally*: when a product is low or a muse suggestion would unlock drinks, surface **in-stock status + price + nearest VA ABC store**.
> 
> - **No official public API.** The state ABC mobile app talks to a private backend; a personal integration captures those endpoints (proxy/MITM **your own** app traffic) to discover the product-search + store-inventory calls. Personal-use only.
> - **Isolation is the whole point.** Hide it behind a stable internal contract so brittleness never leaks upward:
>   ```ts
>   interface ProcurementSource {
>     lookup(product: Product): Promise<{ inStock: boolean; priceCents?: number;
>       stores: { name: string; distanceMi: number; qty?: number }[] } | null>;
>   }
>   ```
>   `va-abc` is one impl; the app depends only on `ProcurementSource`. Adding another state/retailer later = another impl, zero churn elsewhere.
> - **Hygiene:** unofficial endpoints drift — cache aggressively (TTL on product/store results), back off and degrade gracefully (a null result just means "no local data," never a crash), keep request volume low. Pin captured request shapes in `integrations/va-abc/CONTRACT.md` so re-capture after an app update is mechanical.
> - **Surfacing:** shopping-list rows gain an optional "local: in stock @ $X — Store (2.1 mi)" line. Never blocks the list; absence is silent.
> 
> ---
> 
> ## Agent execution notes
> - `packages/core` pure/IO-free; unit-test makeability + balance + unit/density first.
> - All boundaries (API, MQTT, HTTP ingest, AI, photo import) parse through Zod before the DB.
> - AI output never trusted re: inventory — validate vs live `makeable` + repair loop.
> - `reading` append-only; `bottle.level_ml` derived cache, rebuildable.
> - One ingest core; MQTT + HTTP are adapters into it. Software is scale-independent — only §4/§0 changed for 100 bottles.

Spec stub: Backbar is a local-first home-bar operating system that combines inventory, depletion tracking, recipes, and AI mixology, with a public guest menu projected from currently-makeable drinks. The novel layer is a per-bottle load-cell smart shelf scaling to ~100+ bottles via a multi-node ESP32 fleet over MQTT, but the entire software loop ships P0/P1 with zero hardware — hardware is additive and tracking is per-bottle opt-in (hybrid). Shipping it means a Bun + Hono + bun:sqlite server, React+Vite operator and guest UIs, AI ideation via Vercel AI SDK + Gateway, and a pluggable sensing core where every level observation is a `reading { source: manual | weight | pour }`.
