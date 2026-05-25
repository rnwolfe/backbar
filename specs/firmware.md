# specs/firmware.md

Detail for `packages/firmware` — fleet node firmware (Arduino Uno R4 WiFi *or* ESP32-S3). Parent: `backbar-architecture-spec.md` §4 + `api.md` §3. Companion docs: `hardware.md` (physical build — BOM, wiring, mounts, housing) and `calibration.md` (cal + tare flow).

**Scope (P2a — one node):** prove HX711 → settle → MQTT publish + birth/LWT + config sync end-to-end on a single board. Fleet scale-out (P2b) is the same firmware on N boards; topology is the broker, not the code.

**Supported board targets** (both ship in `platformio.ini`):
- **Arduino Uno R4 WiFi** (default; Renesas RA4M1 + onboard ESP32-S3 Wi-Fi co-pro). Persistence: on-chip EEPROM. WiFi lib: `WiFiS3`.
- **ESP32-S3 DevKitC-1**. Persistence: NVS via `Preferences`. WiFi lib: `WiFi`.

The two paths differ only in WiFi headers + cal-persistence storage; the settle loop, MQTT plumbing, and channel abstraction are shared. Pin maps and platform diffs live in `main.cpp` behind `BACKBAR_BOARD_*` build flags. Per-board pin tables live in `hardware.md` §2.

---

## 1. Responsibilities

Per channel, every loop:
1. Sample HX711 raw counts.
2. Apply per-channel `cal_slope`/`cal_offset` → grams (cal pushed via `config` topic; persisted in NVS so cold-boot still has it).
3. **Settle detection** — only commit a reading when grams stay within ε for N consecutive seconds (defaults: ε=2 g, N=2 s). This is the line between "the pour" (drop, large delta) and "the new resting state" (the value we actually want).
4. Publish committed reading to `backbar/<device_id>/reading` JSON `{channel, raw_g, ts}` retained.
5. Heartbeat: re-publish current settled state every ~5 min even when unchanged, so the server's `node.last_seen` stays fresh.

On boot:
- Connect Wi-Fi (creds from NVS).
- MQTT connect with **LWT** set to `backbar/<device_id>/lwt` retained empty payload.
- Publish **birth** to `backbar/<device_id>/birth` `{fw_version}` retained.
- Subscribe `backbar/<device_id>/config` — apply on receive.

On `config` message:
```json
{
  "cadence_s": 60,                                  // optional heartbeat interval
  "cal": [{"channel": 0, "slope": 0.001, "offset": -100}, ...]   // optional per-channel cal
}
```
Persist cal to NVS; replace in-RAM cal table. Apply cadence on the next loop.

---

## 2. Topics summary

| Topic                                | Direction      | Retain | Payload                       |
|--------------------------------------|----------------|--------|-------------------------------|
| `backbar/<id>/reading`               | node → broker  | yes    | `{channel, raw_g, ts}`        |
| `backbar/<id>/birth`                 | node → broker  | yes    | `{fw_version, label?}`        |
| `backbar/<id>/lwt`                   | broker LWT     | yes    | `""` (empty)                  |
| `backbar/<id>/config`                | broker → node  | yes    | `{cadence_s?, cal?}`          |

Server side parses each via Zod (`packages/server/src/mqtt/topics.ts`) before touching the DB — per the global "Zod at every boundary" rule.

---

## 3. Hardware fork (decide at P2)

Two viable wirings; firmware abstracts both behind a `Channel { read(): int32 }`:

- **HX711 per cell** — `lib_deps: bogde/HX711`. SCK shared, DOUT per channel. 8–16 channels/board.
- **ADS1256 (or similar)** — SPI bus, 8 channels/chip, 16–32 channels/board via two chips.

P2a target is HX711 per cell (cheapest entry; one board, ~6–8 cells).

---

## 4. Settle detection algorithm

```
buffer       = ring of last K samples (K = sample_rate * settle_window_s)
candidate_g  = null
last_emit_g  = the last grams value we published

each sample:
  g = applyCal(raw)
  buffer.push(g)
  spread = max(buffer) - min(buffer)
  if spread <= settle_epsilon_g:
    candidate_g = mean(buffer)
    if |candidate_g - last_emit_g| >= emit_delta_g OR heartbeat_due:
      publish({channel, raw_g, ts})
      last_emit_g = candidate_g
      reset_heartbeat()
  else:
    candidate_g = null  // still settling (a pour is in progress)
```

Tunables (defaults in `main.cpp`):
- `SETTLE_EPSILON_G = 2.0` — load-cell noise floor at typical HX711 gain.
- `SETTLE_WINDOW_S = 2.0` — how long the value must hold to count as settled.
- `EMIT_DELTA_G    = 1.0` — minimum change to publish (deduplicates retained state).
- `HEARTBEAT_S     = 300` — heartbeat republish interval.
- `SAMPLE_HZ       = 10`  — HX711 80 SPS mode divided down for stability.

The server *also* coalesces `reading.updated` bursts on a 250 ms window (`packages/server/src/serve.ts`); settle is the primary line of defense.

---

## 5. Build / flash

```bash
cd packages/firmware
# Configure broker + credentials in src/secrets.h (gitignored — see secrets.h.example)
pio run                                       # build default env (uno_r4_wifi)
pio run -e esp32-s3-devkitc-1                 # build the ESP32 target instead
pio run -t upload                             # flash default env via USB
pio device monitor                            # serial @ 115200
```

`platformio.ini` pins `bogde/HX711`, `knolleary/PubSubClient`, and `bblanchon/ArduinoJson` across both envs. PlatformIO is *not* required for the server tests — the firmware is shipped as source.

See `hardware.md` §7 for the full kit→first-reading checklist that walks from cell wiring through cal/tare in the Console.

---

## 6. P0/P1 compatibility

The firmware is additive. Server runs with `MQTT_URL` unset → no subscriber → manual readings drive everything via `POST /ingest/reading`. The instant `MQTT_URL` is set and a node connects, weight readings start flowing through the same ingest core (`applyReading()`). Hybrid (per-bottle `tracked=1|0`) is native to the data model — no firmware flag.
