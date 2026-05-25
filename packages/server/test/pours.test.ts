import { describe, expect, test } from "bun:test";
import { pours as poursRepo, uuidv7 } from "@backbar/db";
import { call, setup } from "./_helpers";

const dayMs = 86_400_000;

describe("/pours analytics", () => {
  test("GET /pours returns recent pours with recipe meta + ml", async () => {
    const { app, db } = setup();
    const now = Date.now();
    poursRepo(db).insert({
      id: uuidv7(),
      recipe_id: "daiquiri",
      made_at: now - 1000,
      bottles_used: [
        { bottle_id: "b-rum", ml: 60 },
        { bottle_id: "b-lime", ml: 22 },
        { bottle_id: "b-simple", ml: 15 },
      ],
    });

    const res = await call(app, "GET", "/pours?limit=5");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.length).toBe(1);
    expect(body[0].recipe_name).toBe("Daiquiri");
    expect(body[0].ml).toBe(97);
  });

  test("GET /pours?since= filters by made_at", async () => {
    const { app, db } = setup();
    const now = Date.now();
    poursRepo(db).insert({
      id: uuidv7(),
      recipe_id: "daiquiri",
      made_at: now - 10 * dayMs,
      bottles_used: [{ bottle_id: "b-rum", ml: 60 }],
    });
    poursRepo(db).insert({
      id: uuidv7(),
      recipe_id: "daiquiri",
      made_at: now - 1000,
      bottles_used: [{ bottle_id: "b-rum", ml: 60 }],
    });

    const cutoff = now - dayMs;
    const res = await call(app, "GET", `/pours?since=${cutoff}`);
    const body = await res.json();
    expect(body.length).toBe(1);
    expect(body[0].made_at).toBeGreaterThanOrEqual(cutoff);
  });

  test("GET /pours/summary buckets per day for the configured window", async () => {
    const { app, db } = setup();
    const now = Date.now();
    // Seed 3 pours: today, 5d ago, 20d ago
    for (const offset of [0, 5, 20]) {
      poursRepo(db).insert({
        id: uuidv7(),
        recipe_id: "daiquiri",
        made_at: now - offset * dayMs,
        bottles_used: [{ bottle_id: "b-rum", ml: 60 }],
      });
    }
    const res = await call(app, "GET", "/pours/summary?days=28");
    const body = await res.json();
    expect(body.length).toBe(28);
    const total = body.reduce((s: number, d: { pours: number }) => s + d.pours, 0);
    expect(total).toBe(3);
    expect(body[27]!.pours).toBe(1); // today bucket
  });

  test("GET /pours/top-recipes ranks by count", async () => {
    const { app, db } = setup();
    for (let i = 0; i < 5; i++) {
      poursRepo(db).insert({
        id: uuidv7(),
        recipe_id: "daiquiri",
        made_at: Date.now() - i * 1000,
        bottles_used: [{ bottle_id: "b-rum", ml: 60 }],
      });
    }
    const res = await call(app, "GET", "/pours/top-recipes");
    const body = await res.json();
    expect(body[0].recipe_id).toBe("daiquiri");
    expect(body[0].count).toBe(5);
    expect(body[0].recipe_name).toBe("Daiquiri");
  });

  test("GET /pours/top-bottles sums ml per bottle", async () => {
    const { app, db } = setup();
    poursRepo(db).insert({
      id: uuidv7(),
      recipe_id: "daiquiri",
      made_at: Date.now(),
      bottles_used: [
        { bottle_id: "b-rum", ml: 60 },
        { bottle_id: "b-lime", ml: 22 },
      ],
    });
    poursRepo(db).insert({
      id: uuidv7(),
      recipe_id: "daiquiri",
      made_at: Date.now() - 1000,
      bottles_used: [{ bottle_id: "b-rum", ml: 30 }],
    });
    const res = await call(app, "GET", "/pours/top-bottles");
    const body = await res.json();
    expect(body[0].bottle_id).toBe("b-rum");
    expect(body[0].ml).toBe(90);
    expect(body[1].bottle_id).toBe("b-lime");
    expect(body[1].ml).toBe(22);
  });

  test("validates ?days bounds", async () => {
    const { app } = setup();
    const res = await call(app, "GET", "/pours/summary?days=999");
    expect(res.status).toBe(400);
  });
});
