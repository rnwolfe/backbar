# specs/calibration.md

Detail for the 2-point per-channel calibration + per-bottle tare flow. Parent: `backbar-architecture-spec.md` §4 + `data-model.md` (sensor_channel, bottle.tare_g).

```
raw counts ──(channel cal)──► grams (gross) ──(bottle tare)──► net g ──(density)──► ml
            cal_slope, cal_offset                  bottle.tare_g          density(product)
```

Cal is **per channel** (one shelf socket → one load cell, lifetime-static once mounted). Tare is **per bottle** (each physical bottle has its own empty weight). Density is **per product** (overrides → category default; spec §6).

---

## 1. Per-channel calibration

The math is in `packages/core/src/calibration.ts` (`calibrate()` + `rawToGrams()`); the operator-side capture is `POST /nodes/:device_id/calibrate`.

### Flow

1. **Mount the load cell** in its final slot. Bolt-down preload matters — re-cal after any remount.
2. **Capture `empty_raw`** — pull current raw counts from the channel with nothing on it.
3. **Place a known reference mass** on the cell (typical: a 500 g calibration weight, or a sealed water bottle whose weight you measured on a kitchen scale).
4. **Capture `known_raw`** for the same channel with that mass on it.
5. POST:
   ```
   POST /nodes/<device_id>/calibrate
   {"channel": 0, "empty_raw": -120000, "known_raw": 480000, "known_g": 500}
   ```
   Server computes `slope = known_g / (known_raw − empty_raw)`, `offset = −slope * empty_raw`, persists to `sensor_channel`, and pushes the new cal via MQTT `backbar/<device_id>/config` if the subscriber is wired.

### Why the math is split across the boundary

Per-channel cal lives on the **server** (and is pushed to the node), not derived on the node, because:
- Re-calibrating without re-flashing is a hard requirement at fleet scale.
- The 2-point capture wants the operator UI's command palette (⌘K → "Calibrate channel"), not a serial console.
- The same cal must apply equally to readings replayed during recovery.

The node *applies* cal locally so reading payloads carry grams; the server *owns* cal so it can be updated.

---

## 2. Per-bottle tare

A bottle's empty weight is a property of the bottle, not the slot. Two Beefeater 750 ml bottles can share a perfectly calibrated channel and still differ by 20–30 g.

### Flow

1. Empty bottle (or weigh on a kitchen scale and subtract liquid).
2. Place on a calibrated channel.
3. Read current grams from the operator UI (or pull `raw_g` over MQTT and apply cal).
4. PATCH the bottle:
   ```
   PATCH /bottles/<bottle_id>
   {"tare_g": 487.5}
   ```

`applyReading()` subtracts `tare_g` from the channel-derived grams before dividing by density to get ml. Bottles with `tare_g = null` will report inflated volumes — the operator UI flags bottles where `tracked=1 AND tare_g IS NULL` so they're not silently miscounted.

---

## 3. Density

`packages/core/src/units.ts#density()` — overrides via `product.density_g_ml`, else category default (spec §6). The high-proof fork (`category='spirit' AND abv >= 0.5 → 0.93`) is automatic.

---

## 4. When to re-calibrate

- After remounting a load cell (preload changes).
- When `level_ml` for a fresh full bottle deviates from `full_ml` by more than ~5 %.
- Periodically as part of bar cleanup — recommended every 6 months at fleet scale, given humidity and adhesive creep affect HX711 zero.

Re-cal is a single POST; it does not invalidate historical readings (those were correctly converted at write time).
