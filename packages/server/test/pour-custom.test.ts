/**
 * POST /pour/custom — recipe-less single-bottle pour. Used by the "log a
 * shot" affordance in the Bottle Detail overlay.
 */
import { describe, expect, test } from "bun:test";
import { bottles as bottlesRepo } from "@backbar/db";
import { call, eventsFrom, setup } from "./_helpers";

describe("POST /pour/custom", () => {
  test("decrements the bottle and emits reading.updated", async () => {
    const { app, db, deps } = setup();
    const before = bottlesRepo(db).get("b-rum")!.level_ml;

    const events = await eventsFrom(deps, async () => {
      const res = await call(app, "POST", "/pour/custom", { bottle_id: "b-rum", ml: 30 });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        recipe_id: string | null;
        bottles_used: { bottle_id: string; ml: number }[];
      };
      expect(body.recipe_id).toBeNull();
      expect(body.bottles_used).toEqual([{ bottle_id: "b-rum", ml: 30 }]);
    });

    const after = bottlesRepo(db).get("b-rum")!.level_ml;
    expect(after).toBe(before - 30);

    const reading = events.find((e) => e.type === "reading.updated");
    expect(reading).toMatchObject({
      type: "reading.updated",
      bottle_id: "b-rum",
      level_ml: before - 30,
      source: "pour",
    });
  });

  test("422 when ml exceeds current bottle level", async () => {
    const { app } = setup();
    const res = await call(app, "POST", "/pour/custom", { bottle_id: "b-rum", ml: 99999 });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("over-pour");
  });

  test("404 on unknown bottle", async () => {
    const { app } = setup();
    const res = await call(app, "POST", "/pour/custom", { bottle_id: "does-not-exist", ml: 30 });
    expect(res.status).toBe(404);
  });

  test("400 on non-positive ml", async () => {
    const { app } = setup();
    const res = await call(app, "POST", "/pour/custom", { bottle_id: "b-rum", ml: 0 });
    expect(res.status).toBe(400);
  });

  test("emits lowstock.crossed when this pour drops the bottle below the threshold", async () => {
    const { app, deps, db } = setup();
    // 750ml full → low threshold is max(15%, 60ml) = 112.5ml. Land just
    // above (130ml) then pour enough to cross.
    bottlesRepo(db).updateLevel("b-rum", 130);

    const events = await eventsFrom(deps, async () => {
      const res = await call(app, "POST", "/pour/custom", { bottle_id: "b-rum", ml: 30 });
      expect(res.status).toBe(200);
    });

    const low = events.find((e) => e.type === "lowstock.crossed");
    expect(low).toMatchObject({ type: "lowstock.crossed", bottle_id: "b-rum" });
  });
});
