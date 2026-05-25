import type { Node, SensorChannel } from "@backbar/core";

/**
 * Starter fleet — six nodes mirroring the design seed. Five online, one
 * offline (so the Shelf view shows the "node offline" alert path live).
 *
 * `last_seen` is encoded as a *negative seconds offset* from now; seed.ts
 * converts these to absolute timestamps at insert time. This keeps the seed
 * file deterministic across runs without baking in a stale wall clock.
 */
export interface StarterNode {
  device_id: string;
  label: string;
  status: "online" | "offline";
  fw_version: string;
  last_seen_offset_s: number;
}

export const STARTER_NODES: readonly StarterNode[] = [
  { device_id: "shelf-back-left", label: "back-shelf-left", status: "online", fw_version: "0.4.1", last_seen_offset_s: -4 },
  { device_id: "shelf-back-right", label: "back-shelf-right", status: "online", fw_version: "0.4.1", last_seen_offset_s: -2 },
  { device_id: "shelf-mid-1", label: "mid-shelf-1", status: "online", fw_version: "0.4.1", last_seen_offset_s: -6 },
  { device_id: "shelf-mid-2", label: "mid-shelf-2", status: "online", fw_version: "0.4.1", last_seen_offset_s: -3 },
  { device_id: "shelf-prep-1", label: "prep-station", status: "offline", fw_version: "0.4.0", last_seen_offset_s: -1820 },
  { device_id: "shelf-low-1", label: "low-shelf-citrus", status: "online", fw_version: "0.4.1", last_seen_offset_s: -11 },
];

export function nodesAtNow(now: number = Date.now()): Node[] {
  return STARTER_NODES.map(
    (n): Node => ({
      device_id: n.device_id,
      label: n.label,
      status: n.status,
      fw_version: n.fw_version,
      last_seen: now + n.last_seen_offset_s * 1000,
    }),
  );
}

/**
 * Map the first N starter bottles onto channels across the online nodes.
 * Deterministic by bottle index → (node, channel). Calibration is left null
 * until the operator runs a 2-point cal (slope/offset write through then).
 */
export interface StarterChannelInput {
  device_id: string;
  channel: number;
  /** Channel count for the device — used by the seed to lay out unoccupied slots. */
  capacity: number;
}

export const STARTER_NODE_CAPACITY: Record<string, number> = {
  "shelf-back-left": 12,
  "shelf-back-right": 12,
  "shelf-mid-1": 8,
  "shelf-mid-2": 8,
  "shelf-prep-1": 8,
  "shelf-low-1": 8,
};

/**
 * Build channel rows. Bottle ids are passed in so the seed can wire only the
 * bottles that exist post-reset. Channel layout:
 *   - bottles 0..11   → shelf-back-left ch01..12 (full)
 *   - bottles 12..23  → shelf-back-right ch01..12 (full)
 *   - bottles 24..31  → shelf-mid-1 ch01..08 (full)
 *   - bottles 32..38  → shelf-mid-2 ch01..07 (one slot empty)
 *   - bottles 39..42  → shelf-low-1 ch01..04 (half-empty — citrus)
 *   - shelf-prep-1 — offline, no bottles bound
 *
 * Anything past 43 stays unbound (the seed has 21 bottles so this is mostly
 * headroom).
 */
export function channelLayoutFor(bottleIds: string[]): SensorChannel[] {
  const out: SensorChannel[] = [];
  const assignments: { device_id: string; channels: number; take: number }[] = [
    { device_id: "shelf-back-left", channels: 12, take: 12 },
    { device_id: "shelf-back-right", channels: 12, take: 12 },
    { device_id: "shelf-mid-1", channels: 8, take: 8 },
    { device_id: "shelf-mid-2", channels: 8, take: 7 },
    { device_id: "shelf-low-1", channels: 8, take: 4 },
  ];
  let idx = 0;
  for (const a of assignments) {
    for (let ch = 0; ch < a.channels; ch++) {
      const bottleId = ch < a.take ? bottleIds[idx++] ?? null : null;
      out.push({
        device_id: a.device_id,
        channel: ch + 1,
        slot: `${a.device_id}/${String(ch + 1).padStart(2, "0")}`,
        bottle_id: bottleId,
        cal_slope: bottleId ? 0.998 : null,
        cal_offset: bottleId ? -12.3 : null,
      });
    }
  }
  // Offline prep-station — register channels but no bottles bound.
  for (let ch = 0; ch < 8; ch++) {
    out.push({
      device_id: "shelf-prep-1",
      channel: ch + 1,
      slot: `shelf-prep-1/${String(ch + 1).padStart(2, "0")}`,
      bottle_id: null,
      cal_slope: null,
      cal_offset: null,
    });
  }
  return out;
}
