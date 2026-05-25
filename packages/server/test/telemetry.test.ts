import { describe, expect, test } from "bun:test";
import { nodes as nodesRepo, pours as poursRepo, readings as readingsRepo, uuidv7 } from "@backbar/db";
import { call, setup } from "./_helpers";

describe("/telemetry + enhanced /nodes + /bottles/:id/detail", () => {
  test("/telemetry rolls up readings/h, pours today, channels, nodes", async () => {
    const { app, db } = setup();
    const now = Date.now();

    // 3 readings in the last hour
    for (let i = 0; i < 3; i++) {
      readingsRepo(db).insert({
        id: uuidv7(),
        bottle_id: "b-rum",
        level_ml: 700 - i,
        source: "weight",
        confidence: 1,
        raw: null,
        ts: now - i * 60_000,
      });
    }
    // Pour earlier today
    const startOfDay = new Date(now);
    startOfDay.setHours(8, 0, 0, 0);
    poursRepo(db).insert({
      id: uuidv7(),
      recipe_id: "daiquiri",
      made_at: startOfDay.getTime(),
      bottles_used: [{ bottle_id: "b-rum", ml: 60 }],
    });
    // Add a node
    nodesRepo(db).upsert({
      device_id: "dev-1",
      label: "dev-1",
      status: "online",
      fw_version: "0.4.1",
      last_seen: now,
    });

    const res = await call(app, "GET", "/telemetry");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.readings_per_hour).toBe(3);
    expect(body.pours_today).toBe(1);
    expect(body.nodes_total).toBe(1);
    expect(body.nodes_online).toBe(1);
    expect(body.channels_total).toBeGreaterThan(0); // setup adds one
    expect(body.bottles_total).toBe(3);
    expect(body.last_pour_age_s).not.toBeNull();
  });

  test("/nodes now includes channel counts + per-channel summary", async () => {
    const { app, db } = setup();
    nodesRepo(db).upsert({
      device_id: "dev-1",
      label: "dev-1",
      status: "online",
      fw_version: "0.4.1",
      last_seen: Date.now(),
    });

    const res = await call(app, "GET", "/nodes");
    const body = await res.json();
    expect(body.length).toBe(1);
    expect(body[0].channels_total).toBeGreaterThan(0);
    expect(body[0].channels_occupied).toBeGreaterThan(0);
    expect(body[0].channels[0]).toHaveProperty("channel");
    expect(body[0].channels[0]).toHaveProperty("bottle_id");
    expect(body[0].channels[0]).toHaveProperty("calibrated");
  });

  test("/bottles/:id/detail returns readings + stats + calibration", async () => {
    const { app, db } = setup();
    const now = Date.now();

    // Backfill some readings + pours so stats aren't zero
    for (let i = 0; i < 5; i++) {
      readingsRepo(db).insert({
        id: uuidv7(),
        bottle_id: "b-rum",
        level_ml: 700 - i * 30,
        source: "weight",
        confidence: 1,
        raw: null,
        ts: now - i * 86_400_000,
      });
    }
    poursRepo(db).insert({
      id: uuidv7(),
      recipe_id: "daiquiri",
      made_at: now - 86_400_000,
      bottles_used: [{ bottle_id: "b-rum", ml: 60 }],
    });

    const res = await call(app, "GET", "/bottles/b-rum/detail");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bottle.id).toBe("b-rum");
    expect(body.bottle.product.name).toBe("Generic Rum");
    expect(body.readings.length).toBe(5);
    expect(body.stats.pours_28d).toBe(1);
    expect(body.stats.ml_dispensed_28d).toBe(60);
    expect(body.calibration).not.toBeNull();
    expect(body.calibration.device_id).toBe("dev-1");
  });

  test("/bottles/:id/detail 404s for missing bottle", async () => {
    const { app } = setup();
    const res = await call(app, "GET", "/bottles/nope/detail");
    expect(res.status).toBe(404);
  });
});
