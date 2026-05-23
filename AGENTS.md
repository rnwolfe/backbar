# AGENTS.md — Backbar

Agent router for the Backbar monorepo. Read this first, then the linked detail file for the area you're touching. Keep changes scoped to one package per task where possible.

> **Backbar** — local-first home-bar OS: inventory + weight-based depletion + recipes + AI mixology, projecting a guest menu. ~100+ bottles. Spec: `specs/backbar-architecture-spec.md` (authoritative; this file never contradicts it).

---

## Routing — go here for X

| If the task is about… | Read | Then edit |
|---|---|---|
| domain types, makeability, balance/dilution math, unit/density conversion | `specs/data-model.md`, this §Conventions | `packages/core` |
| schema, migrations, repositories, canon seed | `specs/data-model.md` | `packages/db` |
| HTTP API, WebSocket, ingest core, MQTT adapter | `specs/api.md` | `packages/server` |
| AI ideate / shopping muse / recipe-photo import | `specs/ai-engine.md` | `packages/server/ai` |
| operator console (dense dark) | `specs/ui-operator.md`, seed: `operator-ui-seed.jsx` | `packages/operator-ui` |
| command palette / global search (⌘K) | spec §5.1, `specs/api.md` (optional `/search`) | `packages/operator-ui` (command registry + client fuzzy) |
| guest menu (snapshot + Caddy) | `specs/ui-guest.md` | `packages/guest-ui` |
| ESP32 firmware, calibration, settle detection | `specs/firmware.md`, `specs/calibration.md` | `packages/firmware` |
| VA ABC procurement lookup | `specs/integrations.md` + spec §10 | `packages/server/integrations/va-abc` |

*(Detail files under `specs/` are written on demand — if a referenced file doesn't exist yet, generate it from the matching spec section before implementing.)*

---

## Repo layout

```
backbar/
  AGENTS.md                     # this router
  README.md                     # human quickstart
  specs/
    backbar-architecture-spec.md  # AUTHORITATIVE source of truth
    data-model.md                 # schema + zod + makeability detail
    api.md                        # endpoint contracts, WS events, ingest core
    ai-engine.md                  # prompts, output schema, repair loop, modes
    ui-operator.md                # console IA + design tokens (see seed)
    ui-guest.md                   # menu IA + publish/Caddy
    firmware.md                   # node topology, MQTT topics, settle detection
    calibration.md                # 2-point cal + tare procedure
    integrations.md               # ProcurementSource + va-abc CONTRACT
  .env.example                  # AI_GATEWAY_API_KEY, MQTT_URL, WEBHOOK_*, HMAC_SECRET
  package.json                  # bun workspaces
  bunfig.toml
  packages/
    core/                       # PURE, no IO. types, zod, makeability, math, conversions
      src/{types,schema,makeability,balance,units}.ts
      test/                     # unit tests FIRST (makeability, balance, units)
    db/                         # bun:sqlite
      src/{client,migrations,repositories,seed}.ts
      migrations/00xx_*.sql
      seed/canon.ts             # layer-1 classics (facts only)
    server/                     # Hono API + WS + ingest
      src/{app,routes,ws,ingest,webhook}.ts
      src/ai/{ideate,shopping,import-photo,prompts,schema}.ts
      src/mqtt/{subscriber,topics}.ts
      src/integrations/va-abc/{index,CONTRACT.md}.ts
    operator-ui/                # React+Vite+Tailwind, dense dark (seed = operator-ui-seed.jsx)
      src/...
    guest-ui/                   # React static (snapshot or Caddy)
      src/...
    firmware/                   # PlatformIO, ESP32-S3 fleet node
      src/main.cpp  platformio.ini
```

---

## Build / run / test

```bash
bun install                          # workspaces
bun run --filter core test           # ALWAYS green before touching dependents
bun run --filter db migrate
bun run --filter db seed             # canon classics
bun run --filter server dev          # Hono API + WS + MQTT subscriber
bun run --filter operator-ui dev
bun run --filter guest-ui build      # static snapshot
bun test                             # full suite
```

Bootstrap AI key once per host: `cp ~/.ai_gateway_api_key` value into `.env` as `AI_GATEWAY_API_KEY` (never commit). Broker: set `MQTT_URL` to the local Mosquitto.

---

## Conventions (enforced)

- **Bun + TypeScript strict.** No `any` at boundaries.
- **Zod at EVERY boundary** — HTTP body, MQTT payload, AI output, photo-import result, migration seed — parse before it touches the DB.
- **IDs:** catalog = slug; events (`reading`/`pour`/`bottle`) = UUIDv7.
- **`packages/core` is pure** — no IO, no DB, no fetch. If you need IO, you're in the wrong package. Unit-test core first.
- **`reading` is append-only.** `bottle.level_ml` is a derived cache, rebuildable by replaying readings. Never mutate a reading.
- **Sensing is pluggable.** Code must never assume hardware exists. `source ∈ manual|weight|pour`; `bottle.tracked` gates weight. Manual + pour paths must work standalone.
- **One ingest core, two adapters.** MQTT subscriber and HTTP `/ingest/reading` both normalize to the same `applyReading()`. Don't fork logic per transport.
- **AI is never trusted re: inventory.** Always validate generated specs against live `makeable`; on violation, re-prompt with the offending ingredient or route to "one bottle away." Never silently substitute.
- **Copyright:** seed only canon *specs* (facts) + book *frameworks* (logic). Never bundle scraped book prose. Owned-book content enters via photo-import only.
- **Integrations stay isolated** behind their interface (`ProcurementSource`); brittleness never leaks upward; degrade to null, never crash.

---

## Build order (greenfield)

1. `core` — types + zod + makeability + balance + units, **with tests**.
2. `db` — migrations + repositories + canon seed.
3. `server` — REST + WS + ingest core (HTTP path) + AI ideate/shopping/import.
4. `operator-ui` — start from `operator-ui-seed.jsx`; wire to server.
5. `guest-ui` — published-makeable menu; snapshot + Caddy.
6. `server/mqtt` + `firmware` — one node first (P2a), then fleet (P2b).
7. `integrations/va-abc` — last, optional.

Match phases in spec §8. P0+P1 ship with zero hardware.
