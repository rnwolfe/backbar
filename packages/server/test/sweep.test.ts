import { describe, expect, test } from "bun:test";
import { bottles as bottlesRepo, categories as categoriesRepo, readings as readingsRepo } from "@backbar/db";
import { call, setup } from "./_helpers";

describe("GET /sweep/bottles — filtered, ordered sweep source list", () => {
  test("returns bottle, product, category, and display metadata", async () => {
    const { db, app } = setup();
    categoriesRepo(db).insert({ id: "rum", label: "Rum", hue: 30, sort_order: 0 });

    const res = await call(app, "GET", "/sweep/bottles");
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(Array.isArray(body.bottles)).toBe(true);
    expect(body.count).toBe(body.bottles.length);
    // Fixed control surface comes back so the tap UI agrees with the server.
    expect(body.controls.map((c: { key: string }) => c.key)).toEqual(["empty", "25", "50", "75", "100"]);

    const rum = body.bottles.find((r: { bottle: { id: string } }) => r.bottle.id === "b-rum");
    expect(rum.product.name).toBe("Generic Rum");
    expect(rum.category.label).toBe("Rum");
    expect(rum.display).toMatchObject({
      name: "Generic Rum",
      category_label: "Rum",
      category_hue: 30,
      level_ml: 700,
      full_ml: 750,
      fill_pct: 93,
      status: "open",
    });
  });

  test("filters by status, category, tracked, low, and q", async () => {
    const { app } = setup();

    const tracked = await (await call(app, "GET", "/sweep/bottles?tracked=true")).json();
    expect(tracked.bottles.map((r: { bottle: { id: string } }) => r.bottle.id)).toEqual(["b-rum"]);

    const citrus = await (await call(app, "GET", "/sweep/bottles?category=citrus")).json();
    expect(citrus.bottles.map((r: { bottle: { id: string } }) => r.bottle.id)).toEqual(["b-lime"]);

    const search = await (await call(app, "GET", "/sweep/bottles?q=rum")).json();
    expect(search.bottles.map((r: { bottle: { id: string } }) => r.bottle.id)).toEqual(["b-rum"]);

    const sealed = await (await call(app, "GET", "/sweep/bottles?status=sealed")).json();
    expect(sealed.count).toBe(0);
  });

  test("rejects an invalid status with 400", async () => {
    const { app } = setup();
    const res = await call(app, "GET", "/sweep/bottles?status=bogus");
    expect(res.status).toBe(400);
  });
});

describe("POST /sweep/level — quarter fills via the append-only ingest core", () => {
  test("75% saves an append-only manual reading and updates the derived level", async () => {
    const { db, app } = setup();
    const before = readingsRepo(db).forBottle("b-rum").length;

    const res = await call(app, "POST", "/sweep/level", { bottle_id: "b-rum", level: "75" });
    expect(res.status).toBe(200);
    const body = await res.json();

    // 750 * 0.75 = 562.5 → rounds to 563.
    expect(body.level_ml).toBe(563);
    expect(body.flipped_empty).toBe(false);

    const log = readingsRepo(db).forBottle("b-rum");
    expect(log.length).toBe(before + 1);
    expect(log[0]?.source).toBe("manual");
    expect(log[0]?.level_ml).toBe(563);
    expect(bottlesRepo(db).get("b-rum")?.level_ml).toBe(563);
  });

  test("100% pins to full_ml exactly", async () => {
    const { app } = setup();
    const body = await (await call(app, "POST", "/sweep/level", { bottle_id: "b-rum", level: "100" })).json();
    expect(body.level_ml).toBe(750);
  });

  test("validates the body with Zod — bad level → 400", async () => {
    const { app } = setup();
    const res = await call(app, "POST", "/sweep/level", { bottle_id: "b-rum", level: "33" });
    expect(res.status).toBe(400);
  });

  test("unknown bottle → 404", async () => {
    const { app } = setup();
    const res = await call(app, "POST", "/sweep/level", { bottle_id: "nope", level: "50" });
    expect(res.status).toBe(404);
  });
});

describe("POST /sweep/level — empty/gone", () => {
  test("records a zero-level reading, flips status empty, returns a shopping signal", async () => {
    const { db, app } = setup();
    const res = await call(app, "POST", "/sweep/level", { bottle_id: "b-lime", level: "empty" });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.level_ml).toBe(0);
    expect(body.status).toBe("empty");
    expect(body.flipped_empty).toBe(true);
    expect(bottlesRepo(db).get("b-lime")?.status).toBe("empty");
    expect(readingsRepo(db).forBottle("b-lime")[0]?.level_ml).toBe(0);

    expect(body.shopping_signal).toMatchObject({
      depleted_bottle_ids: ["b-lime"],
      remaining_in_stock: 0,
      out: true,
    });
    expect(body.shopping_signal.product.id).toBe("lime");
  });

  test("empty/gone surfaces the product on GET /shopping-list without deleting history", async () => {
    const { db, app } = setup();
    await call(app, "POST", "/sweep/level", { bottle_id: "b-lime", level: "empty" });

    // Bottle row + its reading history are preserved — empty is not delete.
    expect(bottlesRepo(db).get("b-lime")).not.toBeNull();
    expect(readingsRepo(db).forBottle("b-lime").length).toBeGreaterThan(0);

    const shopping = await (await call(app, "GET", "/shopping-list")).json();
    const signal = shopping.replacements.find(
      (r: { product: { id: string } }) => r.product.id === "lime",
    );
    expect(signal).toBeDefined();
    expect(signal.out).toBe(true);
    expect(signal.depleted_bottle_ids).toContain("b-lime");
  });
});
