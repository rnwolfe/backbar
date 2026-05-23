import { describe, expect, test } from "bun:test";
import { sensorChannels as sensorChannelsRepo } from "@backbar/db";
import type { ConfigPayload } from "../src/mqtt";
import { call, setup } from "./_helpers";

describe("nodes router — channels + 2-point calibration", () => {
  test("POST /nodes/:id/channels upserts a sensor_channel row", async () => {
    const { app, db } = setup();
    const res = await call(app, "POST", "/nodes/dev-2/channels", {
      channel: 3,
      slot: "shelf-b-3",
      bottle_id: "b-rum",
    });
    expect(res.status).toBe(201);
    const row = sensorChannelsRepo(db)
      .list()
      .find((c) => c.device_id === "dev-2" && c.channel === 3);
    expect(row?.bottle_id).toBe("b-rum");
    expect(row?.slot).toBe("shelf-b-3");
  });

  test("GET /nodes/:id/channels returns only that device's rows", async () => {
    const { app } = setup();
    await call(app, "POST", "/nodes/dev-2/channels", { channel: 0, slot: "x" });
    const res = await call(app, "GET", "/nodes/dev-2/channels");
    const rows = (await res.json()) as Array<{ device_id: string }>;
    expect(rows.every((r) => r.device_id === "dev-2")).toBe(true);
  });

  test("POST /nodes/:id/calibrate computes slope+offset from 2 points", async () => {
    const { app, db } = setup();
    // dev-1/channel 0 is pre-mapped in test fixtures with slope=1, offset=0.
    const res = await call(app, "POST", "/nodes/dev-1/calibrate", {
      channel: 0,
      empty_raw: 100_000,
      known_raw: 600_000,
      known_g: 500,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cal: { slope: number; offset: number } };
    expect(body.cal.slope).toBeCloseTo(500 / 500_000, 10);
    expect(body.cal.offset).toBeCloseTo(-(500 / 500_000) * 100_000, 6);

    const row = sensorChannelsRepo(db)
      .list()
      .find((c) => c.device_id === "dev-1" && c.channel === 0);
    expect(row?.cal_slope).toBeCloseTo(body.cal.slope, 10);
    expect(row?.cal_offset).toBeCloseTo(body.cal.offset, 6);
  });

  test("POST /nodes/:id/calibrate rejects coincident points → 422", async () => {
    const { app } = setup();
    const res = await call(app, "POST", "/nodes/dev-1/calibrate", {
      channel: 0,
      empty_raw: 100,
      known_raw: 100,
      known_g: 500,
    });
    expect(res.status).toBe(422);
  });

  test("POST /nodes/:id/calibrate on unknown channel → 404 (POST /channels first)", async () => {
    const { app } = setup();
    const res = await call(app, "POST", "/nodes/dev-1/calibrate", {
      channel: 99,
      empty_raw: 0,
      known_raw: 1000,
      known_g: 100,
    });
    expect(res.status).toBe(404);
  });

  test("calibration writes invoke deps.pushConfig when set (MQTT calibration push)", async () => {
    const calls: { device_id: string; payload: ConfigPayload }[] = [];
    const { app, deps } = setup();
    deps.pushConfig = (device_id, payload) => calls.push({ device_id, payload });

    await call(app, "POST", "/nodes/dev-1/calibrate", {
      channel: 0,
      empty_raw: 0,
      known_raw: 1000,
      known_g: 100,
    });

    expect(calls.length).toBe(1);
    expect(calls[0]?.device_id).toBe("dev-1");
    expect(calls[0]?.payload.cal?.[0]?.channel).toBe(0);
  });

  test("PATCH /bottles/:id records tare_g (per-bottle, not per-channel)", async () => {
    const { app } = setup();
    const res = await call(app, "PATCH", "/bottles/b-rum", { tare_g: 487.5 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tare_g: number };
    expect(body.tare_g).toBe(487.5);
  });
});
