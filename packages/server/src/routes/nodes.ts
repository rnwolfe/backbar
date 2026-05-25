import { Hono } from "hono";
import { z } from "zod";
import { calibrate, SensorChannel } from "@backbar/core";
import { nodes as nodesRepo, sensorChannels as sensorChannelsRepo } from "@backbar/db";
import type { Deps } from "../deps";
import { err, parseBody } from "../errors";

const ChannelUpsert = z.object({
  channel: z.number().int().nonnegative(),
  slot: z.string().min(1),
  bottle_id: z.string().min(1).nullable().optional(),
  cal_slope: z.number().nullable().optional(),
  cal_offset: z.number().nullable().optional(),
});

const CalibrateBody = z.object({
  channel: z.number().int().nonnegative(),
  empty_raw: z.number(),
  known_raw: z.number(),
  known_g: z.number().positive(),
});

const ResetBody = z.object({
  channel: z.number().int().nonnegative(),
});

/**
 * Spec §1 + §4 + api.md §1:
 *   GET    /nodes                              fleet health
 *   POST   /nodes/:device_id/channels          upsert sensor_channel binding
 *   POST   /nodes/:device_id/calibrate         2-point calibration → slope/offset
 *
 * Calibration writes land in `sensor_channel.cal_slope/cal_offset` and are
 * pushed to the node via MQTT `backbar/<device_id>/config` (retained) when a
 * subscriber is wired. Without MQTT (P0/P1, broker down), the values still
 * persist — the firmware picks them up on next config sync.
 */
export function nodesRouter(deps: Deps) {
  const r = new Hono();

  r.get("/", (c) => {
    const all = nodesRepo(deps.db).list();
    const channels = sensorChannelsRepo(deps.db).list();
    const byDevice = new Map<string, typeof channels>();
    for (const ch of channels) {
      const list = byDevice.get(ch.device_id) ?? [];
      list.push(ch);
      byDevice.set(ch.device_id, list);
    }
    return c.json(
      all.map((n) => {
        const chs = byDevice.get(n.device_id) ?? [];
        const occupied = chs.filter((ch) => ch.bottle_id !== null).length;
        return {
          ...n,
          channels_total: chs.length,
          channels_occupied: occupied,
          channels: chs.map((ch) => ({
            channel: ch.channel,
            slot: ch.slot,
            bottle_id: ch.bottle_id,
            calibrated: ch.cal_slope != null && ch.cal_offset != null,
          })),
        };
      }),
    );
  });

  r.get("/:device_id/channels", (c) => {
    const device_id = c.req.param("device_id");
    const channels = sensorChannelsRepo(deps.db)
      .list()
      .filter((ch) => ch.device_id === device_id);
    return c.json(channels);
  });

  /**
   * Latest raw sample for a channel — the calibration UI polls this during
   * the 2-point capture (when the channel is in identity-cal mode and `raw_g`
   * carries literal HX711 counts).
   */
  r.get("/:device_id/channels/:channel/sample", (c) => {
    const device_id = c.req.param("device_id");
    const channelStr = c.req.param("channel");
    const channel = Number.parseInt(channelStr, 10);
    if (!Number.isFinite(channel) || channel < 0) {
      return err(c, 400, "validation", `channel must be a non-negative integer, got '${channelStr}'`);
    }
    const sample = deps.rawSamples.get(device_id, channel);
    if (!sample) return err(c, 404, "no-sample", `no reading observed yet for ${device_id}/${channel}`);
    return c.json(sample);
  });

  /**
   * POST /nodes/:device_id/calibrate/reset {channel}
   * Sets the channel to identity cal (slope=1, offset=0) and pushes the config
   * so the firmware starts publishing raw HX711 counts. First step of the cal
   * flow — the operator captures empty + known mass against raw readings, then
   * POSTs /calibrate which computes + restores cal.
   */
  r.post("/:device_id/calibrate/reset", async (c) => {
    const device_id = c.req.param("device_id");
    const parsed = await parseBody(c, ResetBody);
    if (parsed.error) return parsed.response;

    const existing = sensorChannelsRepo(deps.db)
      .list()
      .find((ch) => ch.device_id === device_id && ch.channel === parsed.data.channel);
    if (!existing) {
      return err(c, 404, "not-found", `channel ${device_id}/${parsed.data.channel}`);
    }
    const saved = sensorChannelsRepo(deps.db).upsert({
      ...existing,
      cal_slope: 1,
      cal_offset: 0,
    });
    pushCalibrationForDevice(deps, device_id);
    return c.json({ channel: saved, mode: "identity" });
  });

  r.post("/:device_id/channels", async (c) => {
    const device_id = c.req.param("device_id");
    const parsed = await parseBody(c, ChannelUpsert);
    if (parsed.error) return parsed.response;

    const channel = SensorChannel.parse({
      device_id,
      channel: parsed.data.channel,
      slot: parsed.data.slot,
      bottle_id: parsed.data.bottle_id ?? null,
      cal_slope: parsed.data.cal_slope ?? null,
      cal_offset: parsed.data.cal_offset ?? null,
    });
    const saved = sensorChannelsRepo(deps.db).upsert(channel);
    pushCalibrationForDevice(deps, device_id);
    return c.json(saved, 201);
  });

  r.post("/:device_id/calibrate", async (c) => {
    const device_id = c.req.param("device_id");
    const parsed = await parseBody(c, CalibrateBody);
    if (parsed.error) return parsed.response;

    let cal;
    try {
      cal = calibrate(parsed.data);
    } catch (e) {
      return err(c, 422, "calibration", (e as Error).message);
    }

    // Find or create the channel row, preserving slot/bottle_id.
    const existing = sensorChannelsRepo(deps.db)
      .list()
      .find((ch) => ch.device_id === device_id && ch.channel === parsed.data.channel);
    if (!existing) {
      return err(c, 404, "not-found", `channel ${device_id}/${parsed.data.channel} (POST /channels first)`);
    }

    const saved = sensorChannelsRepo(deps.db).upsert({
      ...existing,
      cal_slope: cal.slope,
      cal_offset: cal.offset,
    });
    pushCalibrationForDevice(deps, device_id);
    return c.json({ channel: saved, cal });
  });

  return r;
}

function pushCalibrationForDevice(deps: Deps, device_id: string): void {
  if (!deps.pushConfig) return;
  const channels = sensorChannelsRepo(deps.db)
    .list()
    .filter((ch) => ch.device_id === device_id && ch.cal_slope != null && ch.cal_offset != null);
  if (channels.length === 0) return;
  try {
    deps.pushConfig(device_id, {
      cal: channels.map((ch) => ({
        channel: ch.channel,
        slope: ch.cal_slope as number,
        offset: ch.cal_offset as number,
      })),
    });
  } catch (e) {
    console.warn(`[nodes] pushConfig failed for ${device_id}`, e);
  }
}
