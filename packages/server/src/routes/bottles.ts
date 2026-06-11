import { Hono } from "hono";
import { z } from "zod";
import { Bottle, Status } from "@backbar/core";
import {
  bottles as bottlesRepo,
  pours as poursRepo,
  products as productsRepo,
  readings as readingsRepo,
  sensorChannels as channelsRepo,
  uuidv7,
} from "@backbar/db";
import type { Deps } from "../deps";
import { err, parseBody } from "../errors";

/**
 * POST shape — most fields optional so the operator can drop a bottle in
 * with just `{product_id}`; the route fills sensible defaults from the
 * product catalog and `full_ml`.
 */
const BottleCreate = Bottle.partial({
  id: true,
  full_ml: true,
  level_ml: true,
  status: true,
  tracked: true,
}).extend({ product_id: Bottle.shape.product_id });

const BottlePatch = Bottle.partial();

export function bottlesRouter(deps: Deps) {
  const r = new Hono();

  r.get("/", (c) => {
    const status = c.req.query("status");
    if (status) {
      const parsed = Status.safeParse(status);
      if (!parsed.success) return err(c, 400, "validation", parsed.error.issues);
    }

    const list = bottlesRepo(deps.db).list();
    const filtered = status ? list.filter((b) => b.status === status) : list;
    const productMap = new Map(productsRepo(deps.db).list().map((p) => [p.id, p] as const));
    return c.json(filtered.map((b) => ({ ...b, product: productMap.get(b.product_id) ?? null })));
  });

  /**
   * Latest raw sample for the channel this bottle is mapped to. Powers the
   * tare-capture flow: the operator places the empty bottle on its cell and
   * reads gross grams off the live cache, then PATCHes `tare_g`.
   *
   * 404 with `no-channel` when the bottle has no sensor channel binding
   * (e.g. a `tracked=0` manual bottle); `no-sample` when the channel exists
   * but no MQTT reading has been observed yet.
   */
  r.get("/:id/sample", (c) => {
    const id = c.req.param("id");
    const bottle = bottlesRepo(deps.db).get(id);
    if (!bottle) return err(c, 404, "not-found", `bottle '${id}'`);

    const channel = channelsRepo(deps.db).list().find((ch) => ch.bottle_id === id);
    if (!channel) return err(c, 404, "no-channel", `bottle '${id}' is not mapped to a sensor channel`);

    const sample = deps.rawSamples.get(channel.device_id, channel.channel);
    if (!sample) return err(c, 404, "no-sample", `no reading observed yet for ${channel.device_id}/${channel.channel}`);
    return c.json({ ...sample, channel: { device_id: channel.device_id, channel: channel.channel, slot: channel.slot } });
  });

  /**
   * Detailed bottle view — sparkline (last N readings), depletion stats over
   * 28d, calibration row if the bottle is mapped to a sensor channel. Powers
   * the Bottle Detail overlay so it never needs synthetic fillers.
   */
  r.get("/:id/detail", (c) => {
    const id = c.req.param("id");
    const bottle = bottlesRepo(deps.db).get(id);
    if (!bottle) return err(c, 404, "not-found", `bottle '${id}'`);

    const product = productsRepo(deps.db).get(bottle.product_id);
    const readingsList = readingsRepo(deps.db).forBottle(id, 14);
    const channel = channelsRepo(deps.db).list().find((ch) => ch.bottle_id === id) ?? null;

    const now = Date.now();
    const since28d = now - 28 * 86_400_000;
    const recentPours = poursRepo(deps.db).list(2000).filter((p) => p.made_at >= since28d);
    const myPours = recentPours.filter((p) => p.bottles_used.some((b) => b.bottle_id === id));
    const mlDispensed = myPours.reduce(
      (s, p) => s + p.bottles_used.filter((b) => b.bottle_id === id).reduce((x, b) => x + b.ml, 0),
      0,
    );
    const pourCount = myPours.length;

    const openedAgo = bottle.opened_at ? Math.round((now - bottle.opened_at) / 86_400_000) : null;
    // EST. EMPTY — extrapolate from average daily depletion. If no recent
    // pours, surface null so the UI shows a dash instead of bogus "0d".
    const dailyMl = pourCount > 0 ? mlDispensed / 28 : 0;
    const estEmptyDays = dailyMl > 0 ? Math.max(0, Math.round(bottle.level_ml / dailyMl)) : null;
    const avgMlPerPour = pourCount > 0 ? Math.round(mlDispensed / pourCount) : null;

    return c.json({
      bottle: { ...bottle, product },
      readings: readingsList,
      stats: {
        pours_28d: pourCount,
        ml_dispensed_28d: Math.round(mlDispensed * 10) / 10,
        opened_days_ago: openedAgo,
        est_empty_days: estEmptyDays,
        avg_ml_per_pour: avgMlPerPour,
      },
      calibration: channel
        ? {
            device_id: channel.device_id,
            channel: channel.channel,
            slot: channel.slot,
            tare_g: bottle.tare_g,
            slope: channel.cal_slope,
            offset: channel.cal_offset,
            density_g_ml: product?.density_g_ml ?? null,
          }
        : null,
    });
  });

  r.post("/", async (c) => {
    const parsed = await parseBody(c, BottleCreate);
    if (parsed.error) return parsed.response;

    const product = productsRepo(deps.db).get(parsed.data.product_id);
    if (!product) return err(c, 404, "not-found", `product '${parsed.data.product_id}'`);

    const full_ml = parsed.data.full_ml ?? product.default_ml ?? 750;
    const bottle = Bottle.parse({
      id: parsed.data.id ?? uuidv7(),
      product_id: parsed.data.product_id,
      slot: parsed.data.slot ?? null,
      tare_g: parsed.data.tare_g ?? null,
      full_ml,
      level_ml: parsed.data.level_ml ?? full_ml,
      status: parsed.data.status ?? "open",
      tracked: parsed.data.tracked ?? false,
      opened_at: parsed.data.opened_at ?? null,
      purchased_at: parsed.data.purchased_at ?? null,
      price_cents: parsed.data.price_cents ?? null,
    });
    const created = bottlesRepo(deps.db).insert(bottle);
    const { changed } = deps.makeable.recompute();
    for (const ch of changed) deps.bus.emit({ type: "makeable.changed", ...ch });
    return c.json(created, 201);
  });

  r.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const existing = bottlesRepo(deps.db).get(id);
    if (!existing) return err(c, 404, "not-found", `bottle '${id}'`);

    const parsed = await parseBody(c, BottlePatch);
    if (parsed.error) return parsed.response;

    const merged = Bottle.parse({ ...existing, ...parsed.data, id });
    deps.db.run(
      `UPDATE bottle SET
         product_id=?, slot=?, tare_g=?, full_ml=?, level_ml=?, status=?, tracked=?,
         opened_at=?, purchased_at=?, price_cents=?
       WHERE id=?`,
      [
        merged.product_id,
        merged.slot ?? null,
        merged.tare_g ?? null,
        merged.full_ml,
        merged.level_ml,
        merged.status,
        merged.tracked ? 1 : 0,
        merged.opened_at ?? null,
        merged.purchased_at ?? null,
        merged.price_cents ?? null,
        id,
      ],
    );
    const { changed } = deps.makeable.recompute();
    for (const ch of changed) deps.bus.emit({ type: "makeable.changed", ...ch });
    return c.json(merged);
  });

  return r;
}
