import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { call, setup } from "./_helpers";

describe("REST surface — spec §5 endpoints", () => {
  test("GET /products lists seeded products", async () => {
    const { app } = setup();
    const res = await call(app, "GET", "/products");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ id: string }>;
    expect(body.map((p) => p.id).sort()).toEqual(["lime", "rum", "simple"]);
  });

  test("POST /products rejects duplicate id with 409", async () => {
    const { app } = setup();
    const res = await call(app, "POST", "/products", {
      id: "rum",
      name: "Other Rum",
      category: "rum",
      flavor_tags: [],
    });
    expect(res.status).toBe(409);
  });

  test("POST /products with invalid body returns 400 validation", async () => {
    const { app } = setup();
    const res = await call(app, "POST", "/products", { id: "bad slug", name: "" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("validation");
  });

  test("PATCH /products/:id merges and returns the parsed object", async () => {
    const { app } = setup();
    const res = await call(app, "PATCH", "/products/rum", { abv: 0.5 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { abv: number };
    expect(body.abv).toBe(0.5);
  });

  test("GET /bottles?status=open returns open bottles with product denormalized", async () => {
    const { app } = setup();
    const res = await call(app, "GET", "/bottles?status=open");
    const body = (await res.json()) as Array<{ id: string; status: string; product: { id: string } }>;
    expect(body.every((b) => b.status === "open")).toBe(true);
    expect(body.find((b) => b.id === "b-rum")?.product?.id).toBe("rum");
  });

  test("POST /bottles fills full_ml from product.default_ml or 750 default", async () => {
    const { app } = setup();
    const res = await call(app, "POST", "/bottles", { product_id: "rum" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { full_ml: number; level_ml: number };
    expect(body.full_ml).toBe(750);
    expect(body.level_ml).toBe(750);
  });

  test("GET /recipes?published=true filters published recipes", async () => {
    const { app } = setup();
    const res = await call(app, "GET", "/recipes?published=true");
    const body = (await res.json()) as Array<{ id: string; is_published: boolean }>;
    expect(body.every((r) => r.is_published)).toBe(true);
  });

  test("PATCH /recipes/:id toggles is_published", async () => {
    const { app } = setup();
    const res = await call(app, "PATCH", "/recipes/daiquiri", { is_published: false });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { is_published: boolean };
    expect(body.is_published).toBe(false);
  });

  test("GET /readings/:bottleId returns the bottle's reading history", async () => {
    const { app } = setup();
    await call(app, "POST", "/ingest/reading", { bottle_id: "b-rum", level_ml: 500 });
    const res = await call(app, "GET", "/readings/b-rum");
    const body = (await res.json()) as Array<{ source: string; level_ml: number }>;
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]?.source).toBe("manual");
  });

  test("GET /readings/:bottleId on unknown bottle → 404", async () => {
    const { app } = setup();
    const res = await call(app, "GET", "/readings/ghost");
    expect(res.status).toBe(404);
  });

  test("GET /makeable returns ranked makeability with denorm recipe summary", async () => {
    const { app } = setup();
    const res = await call(app, "GET", "/makeable");
    const body = (await res.json()) as Array<{
      recipe_id: string;
      state: string;
      recipe: { name: string };
    }>;
    const daiq = body.find((r) => r.recipe_id === "daiquiri");
    expect(daiq?.state).toBe("makeable");
    expect(daiq?.recipe.name).toBe("Daiquiri");
  });

  test("GET /nodes returns the fleet list", async () => {
    const { app } = setup();
    const res = await call(app, "GET", "/nodes");
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });

  test("POST /pour decrements bottle levels and emits events", async () => {
    const { app, deps } = setup();
    const events: { type: string }[] = [];
    deps.bus.on((e) => events.push(e));

    const res = await call(app, "POST", "/pour", { recipe_id: "daiquiri" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { bottles_used: Array<{ ml: number }> };
    expect(body.bottles_used.length).toBe(3);
    // Each depleting binding should produce a reading.updated event.
    expect(events.filter((e) => e.type === "reading.updated").length).toBeGreaterThanOrEqual(3);
  });

  test("POST /pour on a non-makeable recipe → 409", async () => {
    const { app } = setup();
    // Drain rum to 0 to make Daiquiri unmakeable.
    await call(app, "POST", "/ingest/reading", { bottle_id: "b-rum", level_ml: 0 });
    const res = await call(app, "POST", "/pour", { recipe_id: "daiquiri" });
    expect(res.status).toBe(409);
  });

  test("GET /shopping-list returns {low, muse}", async () => {
    const { app } = setup();
    // Trigger low stock on rum.
    await call(app, "POST", "/ingest/reading", { bottle_id: "b-rum", level_ml: 30 });
    const res = await call(app, "GET", "/shopping-list");
    const body = (await res.json()) as { low: unknown[]; muse: unknown[] };
    expect(Array.isArray(body.low)).toBe(true);
    expect(Array.isArray(body.muse)).toBe(true);
  });

  test("GET /guest/menu returns only published + makeable, public shape", async () => {
    const { app } = setup();
    const res = await call(app, "GET", "/guest/menu");
    const body = (await res.json()) as Array<{ name: string; instructions: string | null }>;
    expect(body.length).toBe(1);
    expect(body[0]?.name).toBe("Daiquiri");
    // Public shape leaks no bottle / level / product internals.
    expect(Object.keys(body[0]!).sort()).toEqual(["family", "garnish", "glass", "ice", "instructions", "name", "tags"]);
  });

  test("POST /menu/publish (snapshot mode) writes snapshot and returns {mode, url, count}", async () => {
    const tmp = join(tmpdir(), `backbar-menu-${Date.now()}-${Math.random()}`);
    const { app } = setup({ GUEST_MENU_OUT_DIR: tmp });
    const res = await call(app, "POST", "/menu/publish");
    const body = (await res.json()) as { mode: string; url: string; count: number };
    expect(body.mode).toBe("snapshot");
    expect(body.count).toBe(1);
    expect(body.url.startsWith("file://")).toBe(true);
    // Read the snapshot back.
    const file = Bun.file(`${tmp}/menu.json`);
    expect(await file.exists()).toBe(true);
    const snap = JSON.parse(await file.text()) as Array<{ name: string }>;
    expect(snap[0]?.name).toBe("Daiquiri");
  });

  test("POST /menu/publish (caddy mode) is a no-op publish and writes no file", async () => {
    const tmp = join(tmpdir(), `backbar-menu-caddy-${Date.now()}-${Math.random()}`);
    const { app } = setup({
      GUEST_MENU_OUT_DIR: tmp,
      MENU_SERVE_MODE: "caddy",
      GUEST_PUBLIC_URL: "https://bar.example.com",
    });
    const res = await call(app, "POST", "/menu/publish");
    const body = (await res.json()) as { mode: string; url: string | null; count: number };
    expect(body.mode).toBe("caddy");
    expect(body.url).toBe("https://bar.example.com");
    expect(body.count).toBe(1);
    // Caddy mode never touches disk.
    const file = Bun.file(`${tmp}/menu.json`);
    expect(await file.exists()).toBe(false);
  });

  test("POST /ai/ideate without AI key → 503 ai-disabled", async () => {
    const { app } = setup();
    const res = await call(app, "POST", "/ai/ideate", { brief: "something tiki", mode: "now" });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("ai-disabled");
  });

  test("GET /ai/shopping returns deterministic coverage (no AI key needed)", async () => {
    const { app } = setup();
    const res = await call(app, "GET", "/ai/shopping");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ranked: unknown[] };
    expect(Array.isArray(body.ranked)).toBe(true);
  });

  test("POST /recipes/import-photo without AI key → 503", async () => {
    const { app } = setup();
    const res = await call(app, "POST", "/recipes/import-photo", {
      image_b64: "AA==",
      media_type: "image/png",
    });
    expect(res.status).toBe(503);
  });

  test("unknown route → 404 not-found envelope", async () => {
    const { app } = setup();
    const res = await call(app, "GET", "/nope");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("not-found");
  });
});
