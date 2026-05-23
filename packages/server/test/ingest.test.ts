import { describe, expect, test } from "bun:test";
import { bottles as bottlesRepo, readings as readingsRepo } from "@backbar/db";
import { applyReading } from "../src/ingest";
import { eventsFrom, setup } from "./_helpers";

describe("ingest core — applyReading()", () => {
  test("manual reading writes append-only reading + updates derived level cache", () => {
    const { db, deps } = setup();
    const before = readingsRepo(db).forBottle("b-rum");

    applyReading(deps, { kind: "manual", bottle_id: "b-rum", level_ml: 500 });

    const after = readingsRepo(db).forBottle("b-rum");
    expect(after.length).toBe(before.length + 1);
    expect(after[0]?.source).toBe("manual");
    expect(after[0]?.level_ml).toBe(500);
    expect(bottlesRepo(db).get("b-rum")?.level_ml).toBe(500);
  });

  test("weight reading resolves channel → bottle, converts g→ml via density+tare", () => {
    const { db, deps } = setup();
    // Generic Rum (category: rum) — no override, no abv high-proof bump,
    // category not in DENSITY_BY_CATEGORY -> default 0.96. Tare = 500 g.
    // raw_g 1100 → net 600 g → 600/0.96 ≈ 625 ml.
    applyReading(deps, { kind: "weight", device_id: "dev-1", channel: 0, raw_g: 1100, ts: 1 });

    const reading = readingsRepo(db).forBottle("b-rum")[0]!;
    expect(reading.source).toBe("weight");
    expect(reading.level_ml).toBeCloseTo(600 / 0.96, 4);
    expect(reading.raw).toMatchObject({ device_id: "dev-1", channel: 0, raw_g: 1100 });
  });

  test("weight reading on unmapped channel throws IngestError(unmapped-channel)", () => {
    const { deps } = setup();
    expect(() =>
      applyReading(deps, { kind: "weight", device_id: "dev-1", channel: 99, raw_g: 1000, ts: 1 }),
    ).toThrow(/unmapped channel/);
  });

  test("reading is never updated — multiple reads append new rows", () => {
    const { db, deps } = setup();
    applyReading(deps, { kind: "manual", bottle_id: "b-rum", level_ml: 600 });
    applyReading(deps, { kind: "manual", bottle_id: "b-rum", level_ml: 400 });

    const log = readingsRepo(db).forBottle("b-rum");
    expect(log.length).toBe(2);
    expect(log.map((r) => r.level_ml).sort()).toEqual([400, 600]);
  });

  test("level_ml ≤ EMPTY_THRESHOLD flips status to empty", () => {
    const { db, deps } = setup();
    applyReading(deps, { kind: "manual", bottle_id: "b-rum", level_ml: 2 });
    expect(bottlesRepo(db).get("b-rum")?.status).toBe("empty");
  });

  test("emits reading.updated on every applyReading", async () => {
    const { deps } = setup();
    const events = await eventsFrom(deps, () => {
      applyReading(deps, { kind: "manual", bottle_id: "b-rum", level_ml: 500 });
    });
    expect(events.filter((e) => e.type === "reading.updated").length).toBe(1);
  });

  test("lowstock.crossed fires only on the transition into low", async () => {
    const { deps } = setup();
    const first = await eventsFrom(deps, () => {
      applyReading(deps, { kind: "manual", bottle_id: "b-rum", level_ml: 50 });
    });
    expect(first.some((e) => e.type === "lowstock.crossed")).toBe(true);

    const second = await eventsFrom(deps, () => {
      applyReading(deps, { kind: "manual", bottle_id: "b-rum", level_ml: 40 });
    });
    expect(second.some((e) => e.type === "lowstock.crossed")).toBe(false);
  });

  test("makeable.changed fires when a recipe flips state", async () => {
    const { deps } = setup();
    // Daiquiri needs ≥60 ml of rum. Drop rum to 10 → makeable→unmakeable.
    const events = await eventsFrom(deps, () => {
      applyReading(deps, { kind: "manual", bottle_id: "b-rum", level_ml: 10 });
    });
    expect(events.some((e) => e.type === "makeable.changed" && e.recipe_id === "daiquiri")).toBe(true);
  });

  test("level_ml clamps to [0, full_ml]", () => {
    const { db, deps } = setup();
    applyReading(deps, { kind: "manual", bottle_id: "b-rum", level_ml: 99999 });
    expect(bottlesRepo(db).get("b-rum")?.level_ml).toBe(750);
    applyReading(deps, { kind: "manual", bottle_id: "b-rum", level_ml: -5 });
    expect(bottlesRepo(db).get("b-rum")?.level_ml).toBe(0);
  });
});
