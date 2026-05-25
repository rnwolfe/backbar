/**
 * Synthetic fill — produces visuals for fields the live API doesn't yet
 * expose. Was a bigger bag in the first cut; most of it has been retired in
 * favour of real endpoints. What's left:
 *
 *   - `decorateMuse` — augments the live shopping muse with a price + store
 *     so the Dash card has the right anatomy (the live response doesn't
 *     carry retail metadata).
 *   - `mqttRows` — a hand-curated MQTT log snapshot for the Shelf screen.
 *     Drop this when the WS subscriber forwards real broker events to the UI.
 *   - `buildAlerts` — derives a curated alerts feed off live low bottles +
 *     offline nodes. Pure derivation, no fabrication.
 */
import type { DecoratedBottle } from "./derive";

export interface AlertRow {
  sev: "crit" | "warn" | "info";
  label: string;
  msg: string;
}

/** Curated alerts feed off the live low-bottle list + offline nodes. */
export function buildAlerts(
  bottles: DecoratedBottle[],
  offlineNodes: { device_id: string; label: string | null | undefined }[],
): AlertRow[] {
  const low = [...bottles].filter((b) => b.low).sort((a, b) => a.pct - b.pct);
  const alerts: AlertRow[] = [];
  for (const b of low.slice(0, 6)) {
    alerts.push({
      sev: b.crit ? "crit" : "warn",
      label: b.name,
      msg: `${b.level_ml}ml left · ${b.crit ? "order soon" : "low"}`,
    });
  }
  for (const n of offlineNodes) {
    alerts.push({
      sev: "info",
      label: n.label ?? n.device_id,
      msg: "node offline",
    });
  }
  return alerts;
}

export interface MqttRow {
  t: string;
  topic: string;
  payload: string;
  tone: "ok" | "warn" | "crit";
}

/** Static MQTT-stream snapshot. Re-derives "ago" labels off the tick. */
export function mqttRows(seconds: number): MqttRow[] {
  const base = new Date();
  const minus = (s: number) => {
    const d = new Date(base.getTime() - s * 1000);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  };
  void seconds;
  return [
    { t: minus(2), topic: "backbar/back-shelf-right/reading", payload: "ch:7 gross_g:872.3 settled:true", tone: "ok" },
    { t: minus(4), topic: "backbar/mid-shelf-1/reading", payload: "ch:3 gross_g:531.1 settled:true", tone: "ok" },
    { t: minus(6), topic: "backbar/prep-station/status", payload: 'state:"offline" reason:"lwt-timeout"', tone: "crit" },
    { t: minus(10), topic: "backbar/back-shelf-left/reading", payload: "ch:11 gross_g:1188.7 settled:true", tone: "ok" },
    { t: minus(14), topic: "backbar/low-shelf-citrus/reading", payload: "ch:1 gross_g:320.4 settled:true", tone: "ok" },
    { t: minus(18), topic: "backbar/back-shelf-right/reading", payload: "ch:2 gross_g:740.9 settled:false drift:1.2", tone: "warn" },
    { t: minus(21), topic: "backbar/mid-shelf-2/reading", payload: "ch:6 gross_g:592.3 settled:true", tone: "ok" },
  ];
}

export interface ShoppingMuseRow {
  product: string;
  name: string;
  unlocks: number;
  urgency: "high" | "med" | "low";
  price: string;
  store: string;
}

const STORE_ROTATION = [
  "Arlington (2.1 mi)",
  "Falls Church (3.4 mi)",
  "Vienna (5.8 mi)",
  "Ballston (1.7 mi)",
];

/** Decorate the live muse list with synthesized price/store. */
export function decorateMuse(
  muse: { product: { id: string; name?: string | null | undefined }; unlocks: string[] }[],
): ShoppingMuseRow[] {
  return muse.map((m, i) => {
    const price = 18 + ((m.product.id.length * 7) % 60);
    return {
      product: m.product.id,
      name: m.product.name ?? m.product.id,
      unlocks: m.unlocks.length,
      urgency: m.unlocks.length >= 3 ? "high" : m.unlocks.length >= 2 ? "med" : "low",
      price: `$${price.toFixed(2)}`,
      store: STORE_ROTATION[i % STORE_ROTATION.length]!,
    };
  });
}
