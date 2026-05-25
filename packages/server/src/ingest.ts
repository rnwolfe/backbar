import {
  density,
  EMPTY_THRESHOLD_ML,
  gramsToMl,
  ManualReading,
  Reading,
  WeightReading,
  type Bottle,
} from "@backbar/core";
import {
  bottles as bottlesRepo,
  nodes as nodesRepo,
  products as productsRepo,
  readings as readingsRepo,
  sensorChannels as sensorChannelsRepo,
  uuidv7,
  type DB,
} from "@backbar/db";
import type { Bus } from "./bus";
import { isLowStock } from "./lowstock";
import type { MakeableCache } from "./makeable";

/** Normalized payload accepted by `applyReading()` — both adapters convert into this. */
export type IngestInput =
  | ({ kind: "manual" } & ManualReading & { ts?: number })
  | ({ kind: "weight" } & WeightReading);

export interface IngestResult {
  reading: Reading;
  bottle: Bottle;
  flippedEmpty: boolean;
  crossedLow: boolean;
}

/** Error class so HTTP adapter can map to `409 {error:"unmapped channel"}`. */
export class IngestError extends Error {
  constructor(
    message: string,
    readonly code: "unmapped-channel" | "unknown-bottle" | "no-product" | "invalid-density",
  ) {
    super(message);
    this.name = "IngestError";
  }
}

export interface IngestDeps {
  db: DB;
  bus: Bus;
  makeable: MakeableCache;
}

/**
 * Transport-agnostic ingest core (spec api.md §2 + data-model.md §5).
 *
 * 1. Resolve the target bottle + compute level_ml for the incoming reading.
 * 2. Insert append-only `reading` row.
 * 3. Update `bottle.level_ml`; flip status→'empty' when residue ≤ threshold.
 * 4. Recompute makeable cache; emit `makeable.changed` for transitions.
 * 5. Emit `reading.updated` and, on transition, `lowstock.crossed`.
 *
 * Both HTTP `/ingest/reading` and the MQTT subscriber call this so the
 * normalization logic lives exactly once.
 */
export function applyReading(deps: IngestDeps, input: IngestInput): IngestResult {
  const { db, bus, makeable } = deps;

  const resolved = input.kind === "manual" ? resolveManual(db, input) : resolveWeight(db, input);

  const before = resolved.bottle;
  const wasLow = isLowStock(before);

  const level_ml = Math.max(0, Math.min(before.full_ml, resolved.level_ml));
  const ts = resolved.ts ?? Date.now();

  const reading = Reading.parse({
    id: uuidv7(),
    bottle_id: before.id,
    level_ml,
    source: input.kind === "weight" ? "weight" : "manual",
    confidence: 1,
    raw: resolved.raw,
    ts,
  });

  const flippedEmpty = level_ml <= EMPTY_THRESHOLD_ML && before.status !== "empty";
  const nextStatus: Bottle["status"] = flippedEmpty ? "empty" : before.status;

  db.transaction(() => {
    readingsRepo(db).insert(reading);
    bottlesRepo(db).updateLevel(before.id, level_ml, nextStatus);
  })();

  const after: Bottle = { ...before, level_ml, status: nextStatus };
  const nowLow = isLowStock(after);
  const crossedLow = !wasLow && nowLow;

  bus.emit({ type: "reading.updated", bottle_id: after.id, level_ml, source: reading.source, ts });
  if (crossedLow) bus.emit({ type: "lowstock.crossed", bottle_id: after.id, level_ml });

  const { changed } = makeable.recompute();
  for (const c of changed) bus.emit({ type: "makeable.changed", ...c });

  return { reading, bottle: after, flippedEmpty, crossedLow };
}

function resolveManual(
  db: DB,
  input: Extract<IngestInput, { kind: "manual" }>,
): { bottle: Bottle; level_ml: number; raw: Record<string, unknown>; ts?: number } {
  const bottle = bottlesRepo(db).get(input.bottle_id);
  if (!bottle) throw new IngestError(`unknown bottle: ${input.bottle_id}`, "unknown-bottle");
  const raw: Record<string, unknown> = { source: "manual" };
  const out: { bottle: Bottle; level_ml: number; raw: Record<string, unknown>; ts?: number } = {
    bottle,
    level_ml: input.level_ml,
    raw,
  };
  if (input.ts != null) out.ts = input.ts;
  return out;
}

function resolveWeight(
  db: DB,
  input: Extract<IngestInput, { kind: "weight" }>,
): { bottle: Bottle; level_ml: number; raw: Record<string, unknown>; ts?: number } {
  const channel = sensorChannelsRepo(db)
    .list()
    .find((c) => c.device_id === input.device_id && c.channel === input.channel);
  if (!channel || !channel.bottle_id) {
    throw new IngestError(
      `unmapped channel: ${input.device_id}/${input.channel}`,
      "unmapped-channel",
    );
  }
  const bottle = bottlesRepo(db).get(channel.bottle_id);
  if (!bottle) throw new IngestError(`unknown bottle: ${channel.bottle_id}`, "unknown-bottle");

  const product = productsRepo(db).get(bottle.product_id);
  if (!product) throw new IngestError(`bottle has no product: ${bottle.id}`, "no-product");

  // Per spec/calibration.md §2 the node applies cal locally — `raw_g` is
  // already-calibrated gross grams. Server's job is tare subtraction + density.
  // (Previously this multiplied by slope/offset again; that double-application
  // silently inflated all reported levels by the channel's cal factor.)
  const grossG = input.raw_g;
  const netG = grossG - (bottle.tare_g ?? 0);
  const d = density(product);
  if (d <= 0) throw new IngestError(`invalid density for product ${product.id}`, "invalid-density");

  const level_ml = gramsToMl(netG, d);

  // Refresh node last_seen — birth/LWT update status separately.
  const existingNode = nodesRepo(db).list().find((n) => n.device_id === input.device_id);
  nodesRepo(db).upsert({
    device_id: input.device_id,
    label: existingNode?.label ?? null,
    last_seen: input.ts,
    status: existingNode?.status ?? "online",
    fw_version: existingNode?.fw_version ?? null,
  });

  return {
    bottle,
    level_ml,
    raw: {
      source: "weight",
      device_id: input.device_id,
      channel: input.channel,
      raw_g: input.raw_g,
      net_g: netG,
    },
    ts: input.ts,
  };
}
