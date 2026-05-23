---
id: task-008
title: "Smart shelf P2a: MQTT broker, single ESP32 node, calibration, settle,
  node-health, webhook alerts"
status: ready
priority: med
estimate: large
created: 2026-05-23T03:32:27.044Z
updated: 2026-05-23T03:32:27.044Z
---

## Acceptance

- [x] One ESP32-S3 firmware node in packages/firmware reads load-cell weight, performs settle detection (commit only when stable within ε for N seconds), and publishes readings to backbar/<device_id>/reading with MQTT birth/last-will and retained current-state per §4
- [x] Server runs an MQTT subscriber adapter that normalizes node messages into the same ingest core as HTTP /ingest/reading per §4
- [x] 2-point per-channel calibration (empty + known mass) populates sensor_channel.cal_slope/cal_offset; per-bottle tare_g is recorded once; level_ml = (gross_g − tare_g) / density_g_ml per §4
- [x] node table is populated from MQTT birth/LWT and surfaced via GET /nodes and the operator node-health panel per §1/§5
- [x] Generic webhook notification adapter (templated URL + payload) fires for low-stock / node offline events per §0
- [x] Hybrid tracking works end-to-end: bottle.tracked=1 bottles use weight, bottle.tracked=0 bottles continue using manual readings in the same table per §4

## Notes

(agent-maintained)

### Implementation summary

- **MQTT subscriber adapter** — `packages/server/src/mqtt/{topics,subscriber,connect,index}.ts`.
  Subscribes `backbar/+/{reading,birth,lwt}`; routes `reading` payloads
  through the existing `applyReading()` ingest core (one core, two adapters);
  birth/LWT upsert `node.status` and emit on the bus. Server fan-out: WS
  `/live` + webhook adapter pick it up automatically. `attachSubscriber`
  takes a `MqttClientLike` so tests inject a fake; `startMqtt` wires the
  real `mqtt` package against `MQTT_URL`.
- **Calibration** — `packages/core/src/calibration.ts` (`calibrate()` pure
  2-point math) + `POST /nodes/:device_id/calibrate` + `POST /channels`.
  Slope/offset persist in `sensor_channel` and are pushed to the node over
  MQTT `backbar/<id>/config` (retained) when the subscriber is up. Per-bottle
  `tare_g` is recorded via the existing `PATCH /bottles/:id`. Detail spec:
  `specs/calibration.md`.
- **Hybrid tracking** — already native to the model (`bottle.tracked` +
  `reading.source`). Verified by the MQTT test that uses a tracked rum
  bottle (weight via MQTT) alongside the untracked lime bottle (manual);
  both coexist in the same `reading` table with no special casing.
- **Webhook on node.status** — already supported by `WebhookCfg.events`;
  new `webhook.test.ts` exercises the offline notification path.
- **Operator node-health panel** — already in `packages/operator-ui/src/views/Nodes.tsx`;
  it consumes `GET /nodes` + the WS `node.status` event the new subscriber
  emits, so no UI change was required to satisfy this AC.
- **Firmware** — `packages/firmware/src/main.cpp` (HX711 per cell, settle
  detection ε=2 g / N=2 s, MQTT publish with retained reading topic, birth
  + LWT, config subscribe with NVS persistence of cal). Detail spec:
  `specs/firmware.md`. `secrets.h.example` documents required defines;
  real `secrets.h` is gitignored.

### Tests added

- `packages/core/test/calibration.test.ts` — 2-point math, edge cases.
- `packages/server/test/mqtt.test.ts` — message dispatch, birth/LWT,
  unmapped-channel resilience, hybrid tracking coexistence, fake-client
  integration (subscribe + publish + stop).
- `packages/server/test/nodes.test.ts` — channels upsert, calibrate POST,
  pushConfig hook, tare PATCH.
- `packages/server/test/webhook.test.ts` — lowstock + node.status delivery
  paths, event-filter respect.

Full suite: **196 pass / 0 fail** across 23 files. Typecheck clean across
all workspaces.

