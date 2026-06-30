# specs/api.md

Detail for `packages/server` (Hono + WS + ingest + MQTT adapter + webhook). Parent: spec §4, §5. Schemas referenced here live in `core/schema.ts` (see `data-model.md`).

**Conventions**
- Every request body / query parsed through Zod before use; on failure → `400 {error:"validation", issues}`.
- Error envelope: `{ error: string, detail?: unknown }`. Success returns the resource or `{ ok: true }`.
- Auth: operator API assumed LAN-trusted (no per-user auth in P0). `/ingest/reading` requires **HMAC** (`X-Backbar-Sig` = HMAC-SHA256 of raw body with `HMAC_SECRET`). Guest snapshot is read-only and carries no secrets.
- Time = epoch ms. Ids per `data-model.md`.

---

## 1. REST endpoints

### Catalog
```
GET    /products                      -> Product[]
POST   /products            Product    -> Product            (slug must be unique)
PATCH  /products/:id        Partial    -> Product
GET    /bottles            ?status     -> (Bottle & {product})[]
POST   /bottles             Bottle      -> Bottle             (sets level_ml=full_ml unless given)
PATCH  /bottles/:id         Partial    -> Bottle             (slot/tracked/status/tare_g)
```

### Recipes
```
GET    /recipes            ?published  -> Recipe[] (with ingredients)
POST   /recipes             Recipe      -> Recipe
PATCH  /recipes/:id         Partial    -> Recipe             (toggle is_published here)
POST   /recipes/import-photo {image_b64, media_type} -> {draft: Recipe, unresolved: string[]}
       # vision extraction (ai-engine.md §photo). Returns a DRAFT for human confirm; not yet saved.
POST   /recipes/:id/confirm Recipe      -> Recipe            (commit a reviewed draft)
```

### Inventory state & depletion
```
GET    /readings/:bottleId ?limit      -> Reading[]          (desc by ts)
POST   /ingest/reading      ManualReading | WeightReading  -> {ok}   [HMAC for weight]
GET    /makeable                        -> Result[]          (makeable|one-away|unmakeable, see core)
POST   /pour               {recipe_id, overrides?:Binding[]} -> Pour
       # resolves bindings from /makeable, emits source:'pour' readings via applyReading
GET    /shopping-list                   -> { low: Bottle[], muse: {product,unlocks[]}[] }
GET    /nodes                           -> Node[]            (fleet health)
GET    /search             ?q&kind?     -> {kind,id,title,sub}[]   # OPTIONAL — see below
```

`/search` is an **optional** server escape hatch for the ⌘K palette (spec §5.1). Default behavior is client-side fuzzy over already-loaded stores; this endpoint exists only if data outgrows the client. When present: ranks across products/bottles/recipes/nodes, `kind` filters to one type, returns a flat ranked list of `{kind, id, title, sub}`. Commands/actions are **never** server-side — they live only in the client command registry.

### Guest publish
```
POST   /menu/publish                    -> { url, count }    (snapshot mode; see §5)
```

`/makeable` is recomputed on inventory change and cached in memory; the endpoint returns the cache. Response item = `core.Result` plus denormalized recipe summary `{name,family,glass,ice,garnish}` for direct UI render.

---

## 2. Operator inventory sweep contract

The rapid inventory sweep is a stateless operator-client workflow backed by two dedicated server paths plus the existing shopping projection. The server does not create a sweep session row; the client owns the selected filter, ordered bottle ids, cursor, and "last saved" UI state.

```
GET    /sweep/bottles?status=&category=&tracked=&low=&q=   -> { controls, count, bottles[] }
POST   /sweep/level   { bottle_id, level }                 -> { ok, reading_id, level_ml, status, flipped_empty, shopping_signal? }
```

**Start from a selected bottle filter**

1. Operator chooses a bottle filter in the client: `status` (`sealed|open|empty|archived`), `category` (product category slug), `tracked` (bool), `low` (low-stock only), and `q` (case-insensitive product-name search). All optional, AND-combined.
2. Client fetches the ordered source list with `GET /sweep/bottles?…`. The response is the sweep source of truth:
   - `controls` — the fixed control set (below), so the tap UI and server agree.
   - `bottles[]` — each `{ bottle, product, category, display }`. `display` carries `{ name, category, category_label, category_hue, slot, status, tracked, level_ml, full_ml, fill_pct, low }` so the tap UI renders without a second round-trip.
   - Rows are ordered by category sort, then product name, then slot — a stable shelf-walk order the client locks as the sweep id list.
3. Client may apply additional client-only ordering, then stores the resulting bottle ids as the active sweep list and starts at cursor `0`.
4. A sweep row already includes everything needed to compute saved levels: `bottle.full_ml`, `bottle.level_ml`, `bottle.status`, and `product.name`.

`GET /sweep/bottles` is a superset of `GET /bottles` for this flow; clients should prefer it so category + display metadata stay server-owned.

**Controls**

The rapid sweep control surface is intentionally fixed-size for fast tapping. It must offer exactly these saved selections:

| Control | Manual reading submitted |
|---|---|
| Empty / gone | `level_ml = 0` |
| 25% | `level_ml = round(bottle.full_ml * 0.25)` |
| 50% | `level_ml = round(bottle.full_ml * 0.50)` |
| 75% | `level_ml = round(bottle.full_ml * 0.75)` |
| 100% | `level_ml = bottle.full_ml` |

**Save and advance**

For each selected bottle, the client submits the chosen control key — the server resolves it to `level_ml` off that bottle's `full_ml`:

```http
POST /sweep/level
Content-Type: application/json

{ "bottle_id": "<bottle uuid>", "level": "75" }
```

`level ∈ "empty"|"25"|"50"|"75"|"100"`, validated by Zod before any DB touch. Sweep writes do not require HMAC. On success the server returns `{ok:true, reading_id, level_ml, status, flipped_empty}` after routing through the same `applyReading()` ingest core as `POST /ingest/reading`: it inserts `reading{source:"manual"}`, updates the rebuildable `bottle.level_ml` cache, flips `status→empty` at the empty threshold, recomputes makeability, emits `reading.updated`, and emits any resulting low-stock / makeability transitions. Every saved sweep selection therefore creates one append-only manual reading; clients must never implement sweep by `PATCH /bottles/:id` level mutation. (`POST /ingest/reading` with an explicit `level_ml` remains valid; `/sweep/level` is the quarter-fill convenience over it.)

After a `2xx` save, the client advances to the next id in the filtered list immediately. If the save fails, the client stays on the current bottle and displays the error; it must not advance or mark the bottle complete. The client may optimistically render the selected level while waiting, but must reconcile with the returned `level_ml` and subsequent `reading.updated` WebSocket event.

When the cursor reaches the end of the filtered id list, the client may refetch `GET /sweep/bottles` and `GET /shopping-list` to display the sweep summary and replacement prompts. The original filtered list remains stable during the sweep; newly added bottles or concurrent status changes are picked up only by starting another sweep or explicitly refreshing.

**Empty / gone**

Empty / gone is `level: "empty"` — a saved manual reading with `level_ml = 0`, not a deletion command. The ingest core records an append-only zero-level `reading{source:"manual"}` and flips the bottle status to `empty` per the normal empty threshold. The client must not call `DELETE /bottles/:id` as part of the rapid sweep, because bottle rows and readings preserve inventory and pour history until the operator explicitly archives or deletes them outside the sweep.

On an empty/gone save the response additionally carries `shopping_signal` — the product-level replacement prompt for the depleted product: `{ product, depleted_bottle_ids[], remaining_in_stock, out }`. The same signal is projected by `GET /shopping-list` under a `replacements[]` array, coalesced by product (a second emptied bottle of the same product updates the one entry rather than duplicating it). `out` is true when no in-stock bottle of that product remains. The replacement signal is advisory; it does not remove the historical bottle row and does not silently create a new bottle.

---

## 3. Ingest core (one core, two adapters)

```
HTTP  POST /ingest/reading ──┐
                             ├─► parse (Zod) ─► resolve bottle ─► applyReading() ─► WS + webhook
MQTT  backbar/+/reading ─────┘
```

- **Manual** (`ManualReading`): `level_ml` is authoritative; write `reading{source:'manual'}`.
- **Weight** (`WeightReading`): resolve `(device_id,channel)` → `sensor_channel` → `bottle`; `net_g = raw_g·cal_slope+cal_offset − bottle.tare_g`; `level_ml = gramsToMl(net_g, density(product))`; clamp `[0, full_ml]`; write `reading{source:'weight', raw:{raw_g,net_g}}`. Reject if no channel mapping (`409 {error:"unmapped channel"}`).
- `applyReading()` is defined in `data-model.md` §5 and lives in `packages/db`. The server never duplicates its logic per transport.

**HMAC:** verify `X-Backbar-Sig` against the raw body before parsing. Firmware signs with the shared `HMAC_SECRET`.

---

## 4. MQTT adapter — `packages/server/mqtt`

Connect to `MQTT_URL` (local Mosquitto). Topics:
```
backbar/<device_id>/reading   (pub by node)  -> {channel, raw_g, ts}   [retained: last per channel]
backbar/<device_id>/birth     (pub by node)  -> {fw_version}           -> node.status=online
backbar/<device_id>/lwt       (LWT)          -> {}                      -> node.status=offline
backbar/<device_id>/config    (sub by node)  <- {cadence_s, cal:{channel,slope,offset}[]}
```
Subscriber maps `reading` payloads to `WeightReading{device_id,...}` and calls the ingest core. Birth/LWT update `node` + broadcast `node.status`. Config push is how calibration reaches the fleet without polling.

> MQTT is P2. In P0/P1 the subscriber is simply not started; nothing else changes.

---

## 5. WebSocket `/live`

Server→client events (JSON `{type, ...}`):
```
reading.updated   {bottle_id, level_ml, source, ts}
makeable.changed  {recipe_id, state}            // emitted only on transition
node.status       {device_id, status, last_seen}
lowstock.crossed  {bottle_id, level_ml}
```
Operator UI hydrates from REST then patches from WS. Coalesce `reading.updated` bursts (settle detection already throttles at the node, but debounce ~250ms server-side as defense).

---

## 6. Webhook adapter — `packages/server/webhook`

Generic, config-driven (env or a `webhook` config row). Fires on `lowstock.crossed` (and optionally `node.status=offline`).
```ts
type WebhookCfg = {
  url: string;
  method?: "POST"|"PUT";
  headers?: Record<string,string>;
  // template with {{bottle}} {{level_ml}} {{pct}} {{event}}
  body_template: string;   // e.g. ntfy: plain text; Discord/Slack: JSON
};
```
Render template → fetch → on non-2xx, log + retry once (backoff). Never block ingest on webhook delivery (fire-and-forget queue).

---

## 7. Guest publish flow (`POST /menu/publish`)

**Snapshot mode (default):** build `guest-ui` against a read-only projection of `is_published` recipes that are currently `makeable`; emit static assets; push to Vercel (token in env); return `{url, count}`. Re-run on publish or on a `makeable.changed` that flips a published recipe (debounced).

**Caddy mode:** no publish step — `guest-ui` is served live from the home box behind Caddy, reading the same projection endpoint (`GET /guest/menu`, read-only, no inventory internals). Caddy fronts **guest routes only**:
```
bar.example.com {
  reverse_proxy /api/guest/* localhost:8787
  root * /srv/backbar/guest-ui/dist
  file_server
}
```
The operator API (`localhost:8787/*` minus `/api/guest/*`) is never exposed.

`GET /guest/menu` response is the minimal public shape: `{ name, family, glass, ice, garnish, instructions, tags }[]` — no levels, no products, no bottle data.
