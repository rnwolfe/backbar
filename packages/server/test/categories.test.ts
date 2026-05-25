/**
 * /categories CRUD — palette registry for the Console (label + hue + sort).
 * Tests cover the operator workflow: list, create, patch, attempt-delete-in-use,
 * delete-after-reassign.
 */
import { describe, expect, test } from "bun:test";
import { call, setup } from "./_helpers";

describe("/categories", () => {
  test("GET returns empty list when nothing seeded", async () => {
    const { app } = setup();
    const res = await call(app, "GET", "/categories");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test("POST creates, GET lists in sort order", async () => {
    const { app } = setup();
    await call(app, "POST", "/categories", { id: "rum", label: "Rum", hue: 14, sort_order: 50 });
    await call(app, "POST", "/categories", { id: "gin", label: "Gin", hue: 178, sort_order: 10 });

    const res = await call(app, "GET", "/categories");
    expect(res.status).toBe(200);
    const list = (await res.json()) as { id: string; label: string; hue: number }[];
    expect(list.map((c) => c.id)).toEqual(["gin", "rum"]);
  });

  test("POST 409 on duplicate id", async () => {
    const { app } = setup();
    await call(app, "POST", "/categories", { id: "rum", label: "Rum", hue: 14 });
    const res = await call(app, "POST", "/categories", { id: "rum", label: "Different", hue: 30 });
    expect(res.status).toBe(409);
  });

  test("PATCH updates label and hue", async () => {
    const { app } = setup();
    await call(app, "POST", "/categories", { id: "rum", label: "Rum", hue: 14 });
    const res = await call(app, "PATCH", "/categories/rum", { label: "Caribbean Rum", hue: 20 });
    expect(res.status).toBe(200);
    const updated = (await res.json()) as { id: string; label: string; hue: number };
    expect(updated.label).toBe("Caribbean Rum");
    expect(updated.hue).toBe(20);
  });

  test("PATCH 404 on missing id", async () => {
    const { app } = setup();
    const res = await call(app, "PATCH", "/categories/nope", { label: "x" });
    expect(res.status).toBe(404);
  });

  test("DELETE 409 when products still reference the id", async () => {
    // setup() pre-creates products with category 'rum', 'citrus', 'syrup-simple'.
    const { app } = setup();
    await call(app, "POST", "/categories", { id: "rum", label: "Rum", hue: 14 });
    const res = await call(app, "DELETE", "/categories/rum");
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("in-use");
  });

  test("DELETE 204 when no products reference the id", async () => {
    const { app } = setup();
    await call(app, "POST", "/categories", { id: "mezcal", label: "Mezcal", hue: 42 });
    const res = await call(app, "DELETE", "/categories/mezcal");
    expect(res.status).toBe(204);
    const list = (await call(app, "GET", "/categories").then((r) => r.json())) as unknown[];
    expect(list).toHaveLength(0);
  });

  test("DELETE 404 when category does not exist", async () => {
    const { app } = setup();
    const res = await call(app, "DELETE", "/categories/nope");
    expect(res.status).toBe(404);
  });
});
