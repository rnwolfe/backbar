import { describe, expect, test } from "bun:test";
import { bottles, readings, sensorChannels } from "@backbar/db";
import { call, setup } from "./_helpers";

describe("DELETE /bottles/:id", () => {
  test("removes the bottle, cascades readings, frees the sensor channel", async () => {
    const { app, deps } = setup();

    // Seed a reading so we can prove the cascade.
    readings(deps.db).insert({
      id: "r-1",
      bottle_id: "b-rum",
      level_ml: 690,
      source: "manual",
      confidence: 1,
      raw: null,
      ts: Date.now(),
    });
    expect(readings(deps.db).forBottle("b-rum", 10).length).toBeGreaterThan(0);

    const res = await call(app, "DELETE", "/bottles/b-rum");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      id: string;
      freed_channel: { slot: string } | null;
    };
    expect(body.ok).toBe(true);
    expect(body.id).toBe("b-rum");
    // b-rum is bound to dev-1/CH0 (slot shelf-a-1) in the fixture.
    expect(body.freed_channel?.slot).toBe("shelf-a-1");

    // Bottle gone, readings cascaded.
    expect(bottles(deps.db).get("b-rum")).toBeNull();
    expect(readings(deps.db).forBottle("b-rum", 10).length).toBe(0);

    // Channel keeps its device mapping but loses the bottle binding.
    const ch = sensorChannels(deps.db).list().find((c) => c.device_id === "dev-1" && c.channel === 0);
    expect(ch).toBeTruthy();
    expect(ch?.bottle_id).toBeNull();
  });

  test("404 for an unknown bottle", async () => {
    const { app } = setup();
    const res = await call(app, "DELETE", "/bottles/does-not-exist");
    expect(res.status).toBe(404);
  });

  test("a manual (untracked) bottle deletes with freed_channel null", async () => {
    const { app, deps } = setup();
    const res = await call(app, "DELETE", "/bottles/b-lime");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { freed_channel: unknown };
    expect(body.freed_channel).toBeNull();
    expect(bottles(deps.db).get("b-lime")).toBeNull();
  });
});
