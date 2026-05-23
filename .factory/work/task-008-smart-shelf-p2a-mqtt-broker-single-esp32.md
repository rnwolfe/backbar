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

- [ ] One ESP32-S3 firmware node in packages/firmware reads load-cell weight, performs settle detection (commit only when stable within ε for N seconds), and publishes readings to backbar/<device_id>/reading with MQTT birth/last-will and retained current-state per §4
- [ ] Server runs an MQTT subscriber adapter that normalizes node messages into the same ingest core as HTTP /ingest/reading per §4
- [ ] 2-point per-channel calibration (empty + known mass) populates sensor_channel.cal_slope/cal_offset; per-bottle tare_g is recorded once; level_ml = (gross_g − tare_g) / density_g_ml per §4
- [ ] node table is populated from MQTT birth/LWT and surfaced via GET /nodes and the operator node-health panel per §1/§5
- [ ] Generic webhook notification adapter (templated URL + payload) fires for low-stock / node offline events per §0
- [ ] Hybrid tracking works end-to-end: bottle.tracked=1 bottles use weight, bottle.tracked=0 bottles continue using manual readings in the same table per §4

## Notes

(agent-maintained)

