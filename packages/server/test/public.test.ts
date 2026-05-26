/**
 * /guest/recipes|products|bottles/:id — public read-only share cards.
 * Critical invariants:
 *   - 404 on unknown id (don't leak schema-level errors).
 *   - Bottle card NEVER includes level_ml, slot, tare_g, or status — only
 *     a coarse `fullness` bucket.
 *   - No mutations — these endpoints are GET only.
 */
import { describe, expect, test } from "bun:test";
import { call, setup } from "./_helpers";

describe("/guest public share endpoints", () => {
  describe("GET /guest/recipes/:id", () => {
    test("returns sanitized recipe shape", async () => {
      const { app } = setup();
      const res = await call(app, "GET", "/guest/recipes/daiquiri");
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.id).toBe("daiquiri");
      expect(body.name).toBe("Daiquiri");
      expect(Array.isArray(body.ingredients)).toBe(true);
      // Each ingredient should be the sanitized shape, not the raw DB row.
      const first = (body.ingredients as Array<Record<string, unknown>>)[0]!;
      expect(typeof first.label).toBe("string");
      expect(typeof first.optional).toBe("boolean");
      expect(typeof first.garnish).toBe("boolean");
      expect(first).not.toHaveProperty("ref_type");
      expect(first).not.toHaveProperty("ref_id");
    });

    test("404 on unknown recipe id", async () => {
      const { app } = setup();
      const res = await call(app, "GET", "/guest/recipes/does-not-exist");
      expect(res.status).toBe(404);
    });
  });

  describe("GET /guest/products/:id", () => {
    test("returns marketing-style product metadata", async () => {
      const { app } = setup();
      const res = await call(app, "GET", "/guest/products/rum");
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.id).toBe("rum");
      expect(body.name).toBe("Generic Rum");
      expect(body.category).toBe("rum");
      // Internal columns must not leak.
      expect(body).not.toHaveProperty("density_g_ml");
      expect(body).not.toHaveProperty("producer_url");
    });

    test("404 on unknown product id", async () => {
      const { app } = setup();
      const res = await call(app, "GET", "/guest/products/no-such-thing");
      expect(res.status).toBe(404);
    });
  });

  describe("GET /guest/bottles/:id", () => {
    test("returns product card + fullness bucket but never the level", async () => {
      const { app } = setup();
      const res = await call(app, "GET", "/guest/bottles/b-rum");
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.id).toBe("b-rum");
      expect((body.product as Record<string, unknown>).id).toBe("rum");
      expect(body.full_ml).toBe(750);
      expect(["fresh", "open", "low", "empty"]).toContain(body.fullness);
      // Critical: no inventory leak.
      expect(body).not.toHaveProperty("level_ml");
      expect(body).not.toHaveProperty("slot");
      expect(body).not.toHaveProperty("tare_g");
      expect(body).not.toHaveProperty("status");
    });

    test("buckets fullness coarsely (700/750 = fresh)", async () => {
      // Setup() creates b-rum with level_ml: 700 / full_ml: 750 → 93% → fresh.
      const { app } = setup();
      const res = await call(app, "GET", "/guest/bottles/b-rum");
      const body = (await res.json()) as { fullness: string };
      expect(body.fullness).toBe("fresh");
    });

    test("404 on unknown bottle id", async () => {
      const { app } = setup();
      const res = await call(app, "GET", "/guest/bottles/missing");
      expect(res.status).toBe(404);
    });
  });

  test("public endpoints don't shadow operator routes", async () => {
    // The public bottle endpoint hides level_ml; the operator-side
    // /bottles route surface still leaks it. Confirms the public router
    // is scoped to /guest and didn't accidentally take over /bottles.
    const { app } = setup();
    const operatorRes = await call(app, "GET", "/bottles");
    expect(operatorRes.status).toBe(200);
    const list = (await operatorRes.json()) as Array<Record<string, unknown>>;
    const rum = list.find((b) => b.id === "b-rum");
    expect(rum).toBeDefined();
    expect(rum).toHaveProperty("level_ml");
  });
});
