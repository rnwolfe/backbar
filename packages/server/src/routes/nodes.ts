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

  r.get("/", (c) => c.json(nodesRepo(deps.db).list()));

  r.get("/:device_id/channels", (c) => {
    const device_id = c.req.param("device_id");
    const channels = sensorChannelsRepo(deps.db)
      .list()
      .filter((ch) => ch.device_id === device_id);
    return c.json(channels);
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
