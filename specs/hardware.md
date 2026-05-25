# specs/hardware.md

Detail for the physical fleet-node build — load cell, HX711, MCU, mounting, housing.
Parent: `backbar-architecture-spec.md` §4 + `firmware.md` (per-board pin map) + `calibration.md` (cal + tare flow).

**Scope (P2a — one node):** acquire, wire, mount, and house a single 4-channel ESP32-S3 *or* Arduino Uno R4 WiFi node such that bottles on a bar shelf report weight readings to the broker and surface in the Console.

Cost target: **~$70–90 per node** at retail, **~$45 per node** via AliExpress. STLs and CAD files land under `packages/firmware/hardware/` when designed.

---

## 1. Bill of materials (one 4-channel node)

| Part | Qty | ~$ ea | Notes |
|---|---|---|---|
| **MCU** — Arduino Uno R4 WiFi *or* ESP32-S3 DevKitC-1 | 1 | $15–27 | Either is supported by the firmware (multi-env `platformio.ini`). Uno R4 is the default target — Renesas RA4M1 + onboard ESP32-S3 Wi-Fi co-pro, 5 V logic. |
| **HX711 module** (green PCB) | 4 | $1–2 | 80 SPS-capable variant. One per channel; the firmware runs them in parallel via per-channel DOUT pins. Avoid yellow boards (10 SPS lock). |
| **Straight-bar load cell, 5 kg, 4-wire** | 4 | $4–6 | 5 kg covers a full 1 L bottle (~1.6 kg) with headroom. Verify 4-wire: red, black, white, green (R+/R−/A−/A+). 3-wire half-bridges need a reference resistor — skip them. |
| **USB-C cable + 5 V wall wart** | 1 | $5 | Or just power off the home box if it's reachable. Peak draw is ~250 mA. |
| **Hookup wire**, 22 AWG, 4 colors | small spool | $5 | Per channel: 4 wires cell→HX711 + 4 wires HX711→MCU. Crimped Dupont sets also fine. |
| **JST-XH 4-pin connectors** (optional) | 4 pairs | $0.50 | For pluggable cell cables. Optional but recommended if the bar shelf is hard to reach. |

**Mechanical (per channel):**
| Part | Qty | ~$ | Notes |
|---|---|---|---|
| **Cell base mount** (3D-printed or off-the-shelf acrylic) | 1 | $0–3 | Receives the *fixed* end of the cell. |
| **Cell top platform / pan** | 1 | $0–3 | Receives the *free* end; bottle sits on top. |
| **M4 or M5 bolts** (4 short) | 4 | $1 | Check the cell's datasheet — almost always M4 or M5 tapped holes, 15 mm hole spacing per end. |
| **Heat-set threaded inserts** (optional) | 8 | $0.05 ea | Strongly recommended for printed mounts (PETG threads strip after re-mounting). |

**Calibration:**
| Part | Qty | ~$ | Notes |
|---|---|---|---|
| **500 g reference weight** | 1 | $10 | Or skip — any object you've weighed on a kitchen scale works (1 mL water ≈ 1 g). The cal endpoint only needs `known_g`, not a specific value. |

**Total per node:** ~$70 retail (with Microcenter kits bundling cells + HX711 + plates), ~$45 AliExpress (parts + 3D-printed mounts).

---

## 2. Wiring

### Load cell → HX711 (per cell)

| Cell wire | HX711 pin | Function |
|---|---|---|
| Red | E+ | excitation positive |
| Black | E− | excitation negative |
| White | A− | signal negative |
| Green | A+ | signal positive |

Colors vary by manufacturer — **verify against the cell's datasheet** before powering on. Wrong wiring won't fry anything but you'll get no `is_ready()` or wildly wrong readings.

### HX711 → MCU (per channel)

Power: **VCC → 3.3 V, GND → GND**. The 3.3 V supply matches the MCU's logic level (both Uno R4 and ESP32-S3 are 3.3 V GPIO); using 5 V would require a level shifter on DOUT.

Pin mapping is per board — defined in `packages/firmware/src/main.cpp` `CHANNEL_PINS[]`:

**Arduino Uno R4 WiFi** (default):
| Channel | DOUT | SCK |
|---|---|---|
| 0 | D2 | D3 |
| 1 | D4 | D5 |
| 2 | D6 | D7 |
| 3 | D8 | D9 |

**ESP32-S3 DevKitC-1:**
| Channel | DOUT | SCK |
|---|---|---|
| 0 | GPIO 4 | GPIO 5 |
| 1 | GPIO 6 | GPIO 7 |
| 2 | GPIO 15 | GPIO 16 |
| 3 | GPIO 17 | GPIO 18 |

### Pin-saving tip

HX711 SCK can be shared across modules (the MCU drives it; modules only listen). Wiring all four SCKs to one GPIO frees 3 pins — useful if you push past 8 channels on one board. The current firmware uses dedicated SCKs for simplicity; to share, set every `CHANNEL_PINS[i].sck` to the same pin number.

---

## 3. Mechanical principle

**The cell must flex.** A straight-bar cell is a piece of aluminum with strain gauges glued to a thin "waist" — the strain gauges measure micro-bending. Both ends bolted to the same flat surface = no bend = no signal.

```
   fixed end                       free end
    ┌──┐                            ┌──┐
    │ ●│════════════════════════════│● │     ← strain-gauge waist
    │ ●│   ←──── flexes downward    │● │
    └──┘                            └──┘
    bolted DOWN                     bolted UP to platform
    to base                         via standoffs (3–5 mm air gap)
```

Rules that follow from this:
- **Mount the cell horizontally** with the load direction vertical (down). Force in any other direction reads as zero or distorts.
- **3–5 mm air gap** between the platform underside and the base. Closer = platform fouls under load; farther = wasted height with no signal benefit.
- **Don't overtighten** the cell-mount bolts — over-torque deforms the cell.
- **5 kg means 5 kg.** Overload causes permanent zero-shift; the cell may still read but won't return to true zero.

---

## 4. 3D-printable mount parts

Four printed parts per channel:

| Part | Purpose | Rough size |
|---|---|---|
| **Base mount** | Pocket the fixed end of the cell drops into; bolts up through cell's 2 fixed-end holes | ~40 × 25 × 8 mm |
| **Platform / pan** | What the bottle sits on; bolts down through cell's 2 free-end holes via standoffs | 70–80 mm diameter (or square), 5–8 mm thick |
| **Standoffs** ×2 | Lift the platform above the base so the cell can flex; sit on the cell's free end | 10 mm tall, 8 mm OD |
| **Cable channel cover** (optional) | Hides HX711 + wires routed under the base | varies |

**Dimensions to measure from your cell's datasheet (can't be guessed):**
- Mounting hole spacing (commonly 15 mm from each end)
- Thread size (commonly M4 or M5)
- Cell length × width × thickness (commonly 80 × 13 × 13 mm)

### Print settings

| Setting | Value | Why |
|---|---|---|
| **Filament** | PETG | PLA creeps under sustained load — zero drifts down millimeters over weeks. PETG holds. |
| **Infill** | 100 % at bolt points, 25 % elsewhere | Design mount points as solid pillars; let the slicer auto-fill. |
| **Orientation** | Lay flat — layers horizontal | Layers are weakest in tension perpendicular to themselves. Vertical print = bottle weight tries to delaminate layers. |
| **Threaded inserts** | M3 or M4 heat-set, ~$0.05 ea | Threading directly into PETG holds for a while but loosens after re-mounts. Brass inserts last forever. |
| **Wall count** | 4 perimeters | Margin against bolt pull-through over time. |

### Existing designs to remix

Search Printables / Thingiverse — dozens of mount designs for the standard 5 kg cell:
- "5kg load cell mount" — base + platform pairs in PETG
- "HX711 case" — module enclosure if you want it hidden
- "coffee scale" / "kitchen scale" remixes — refined for sub-mm precision, same geometry

The shortcut: pull a battle-tested base+platform pair that matches your cell's hole pattern, then design *only* the Backbar-specific bits around them — the row layout, cable channels, and MCU enclosure.

---

## 5. Housing (shelf-mounted)

### Option A — Integrated tray (recommended)

```
┌─────────────────────────────────────────────────────────┐
│  ┌──┐    ┌──┐    ┌──┐    ┌──┐                    ┌──┐   │
│  │○○│    │○○│    │○○│    │○○│                    │UC│   │  ← MCU enclosure
│  └──┘    └──┘    └──┘    └──┘                    └──┘   │     (USB-C exit)
│   ↕       ↕       ↕       ↕                              │
│  cell    cell    cell    cell                            │
│ ═════════════════════════════════════════════════════════│  ← cable channel
└─────────────────────────────────────────────────────────┘
   ~90 mm centers
```

- One print (or 2–3 segments with flex couplers if it exceeds bed size)
- Cable channel runs lengthwise underneath; HX711 modules tuck into recessed pockets
- One end terminates in an enclosure for the MCU + USB-C exit
- For a 4-channel node on a typical bar shelf: ~**400 × 100 × 25 mm**

**Height budget** (about as slim as a straight-bar cell allows):
| Layer | mm |
|---|---|
| Base plate | 4 |
| Air gap (cell flex) | 10 |
| Platform / pan | 8 |
| Rim (optional, hides hardware) | 3 |
| **Total stack** | **~25 mm** |

### Option B — Discrete pucks

```
   ╔══╗      ╔══╗      ╔══╗      ╔══╗
   ║p ║      ║p ║      ║p ║      ║p ║         each puck ~80 × 40 × 25 mm
   ╚══╝      ╚══╝      ╚══╝      ╚══╝         HX711 inside
    │         │         │         │           JST-XH cable out one side
    └─────────┴────┬────┴─────────┘
                   │
              [MCU box]
```

- Move bottles freely — each puck is independent
- Wires visible unless you channel them under shelf trim
- More prints but each one is small and fast
- Useful for retrofits where the bar layout changes often

### Option C — slimmer profiles (deferred)

If 25 mm is too tall:
- **Button / disc load cells** sit flush — no platform layer needed, ~8 mm total stack — but pricier (~$15/ea) and harder to source in 5 kg variants
- **Single-point parallel-beam cells** mounted under a shared platform — one cell reads the *sum* across a multi-bottle zone, useless for per-bottle attribution (architecture spec §4 explicitly rejects this)

P2a sticks with straight-bar.

---

## 6. Sourcing notes

### Microcenter "Inland 5 kg HX711 kit" (~$10–15)

Bundles cell + HX711 + acrylic mounting plates + bolts. One kit = one channel. **The acrylic plates are the value-add** — they save you the print or DIY cut. Verify in-store that the kit you grab includes the plates (some "scale kits" ship just the cell + HX711). Best path if you want minimum effort and have a Microcenter nearby.

### Amazon "5 kg + HX711" listings (~$5–10/channel)

Generic Chinese-brand listings (ShangHJ, HiLetgo, etc.) ship bare cells + HX711s + wires, usually no mounting hardware. Cheaper per channel but you DIY-print the mounts. Checklist for any listing:

1. Cell capacity **5 kg** (not 1 kg, not 20 kg)
2. **4-wire cell** (not 3-wire — verify in product photos)
3. **Green PCB HX711** (not yellow)
4. Product photos show **bare cells + HX711 boards** (not an assembled scale with a display — that's a different product, useless for DIY)
5. Quantity per pack matches your channel count

### AliExpress (~$3–5/channel)

Same parts as Amazon at ~½ price, 2–3× shipping time. Worthwhile if you're building multiple nodes.

### Reference mass

Anything you've weighed on a kitchen scale works. The cal endpoint accepts `known_g` as a free parameter. A sealed 500 mL water bottle (~500 g) is the convention. A bag of rice, a hand weight, a calibration weight set — all fine.

---

## 7. Kit-to-first-reading checklist

The complete path from "hardware in box" to "Bottle Wall shows a live weight reading."

### One-time infra setup

1. Install Mosquitto on the home box: `brew install mosquitto` (Mac) / `apt install mosquitto` (Debian). Enable + start the service. Default listener on **1883**.
2. Set `MQTT_URL=mqtt://<homebox>:1883` in `.env`. Restart the server. Startup log should show `mqtt: mqtt://<homebox>:1883` instead of `mqtt: disabled`.

### Per-channel build (repeat 4× for a full node)

3. Wire load cell to HX711 (red→E+, black→E−, white→A−, green→A+). Bolt-mount the cell — fixed end to base, free end to platform with standoffs (3–5 mm air gap).
4. Wire HX711 to MCU per the pin table in §2 (one DOUT + SCK per channel; shared VCC=3.3V + GND).

### Firmware flash (once per MCU)

5. `cp packages/firmware/src/secrets.h.example src/secrets.h` and fill in WiFi creds, broker IP, and a `DEVICE_ID` (a short kebab-case slug, e.g. `back-shelf-left`).
6. `pio run -e uno_r4_wifi -t upload && pio device monitor` (or `-e esp32-s3-devkitc-1` for ESP32). Verify on serial:
   - `[boot] backbar node back-shelf-left fw=… platform=…`
   - `[wifi] connected`
   - `[mqtt] connected + subscribed config`

### Bind + calibrate in the Console

7. `GET /nodes` should now show the new device with `status:"online"`. (It also appears in the Shelf tab.)
8. `POST /nodes/<DEVICE_ID>/channels {channel:0, slot:"<short-name>", bottle_id:"<bottle-id>"}` to bind the channel to a bottle. (Operator UI for this lands in a follow-up — currently `curl`.)
9. Open the Console → Shelf tab → click any channel pill on the node's card. The Calibrate overlay opens:
   1. Auto-pushes identity cal (slope=1, offset=0) to the device
   2. Live HX711 raw count shows in the live readout
   3. Capture **empty** → place a known mass → enter `known_g` → Capture + submit
   4. Server computes slope+offset, persists, pushes via MQTT — device saves to EEPROM/NVS on receipt

### Tare the bottle

10. Console → Bottles tab → click the calibrated bottle to open Bottle Detail. The Calibration cell shows `tare_g: not set` (amber). Click **TARE BOTTLE**:
    1. Live gross grams shown
    2. Place the *empty* bottle on the cell, capture, confirm
    3. PATCHes `bottle.tare_g`; future readings subtract this before computing `level_ml`

### Verify

11. Add liquid to the bottle. The Bottle Detail sparkline should populate within ~2 s (settle window), Bottle Wall pct ticks down as you pour, WS broadcasts `reading.updated` to all open Console sessions.

---

## 8. Scaling beyond one node

Per `backbar-architecture-spec.md` §4, scale-out is the broker's job, not the code:
- Add a second node with a different `DEVICE_ID` → it shows up in `GET /nodes` on first birth message; no server config change required
- HX711-per-cell tops out around 8–12 channels per board before wiring gets miserable
- Past that, prefer a second node over a multi-channel ADC for P2a — the broker handles fleet topology transparently
- If you do go multi-channel ADC (ADS1256, 8 ch/chip), the `Channel { read(): int32 }` abstraction in the firmware is the swap point (see `firmware.md` §3)
