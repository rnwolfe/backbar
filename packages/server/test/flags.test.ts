/**
 * /flags — operator-toggleable feature flags. Defaults live in the
 * server-side registry; the DB stores sparse overrides only.
 */
import { describe, expect, test } from "bun:test";
import { call, eventsFrom, setup } from "./_helpers";
import { FLAG_REGISTRY, projectFlags } from "../src/routes/flags";

describe("/flags", () => {
  test("GET returns the registry with default values when no overrides exist", async () => {
    const { app } = setup();
    const res = await call(app, "GET", "/flags");
    expect(res.status).toBe(200);
    const list = (await res.json()) as { key: string; enabled: boolean; default_enabled: boolean }[];
    expect(list).toHaveLength(FLAG_REGISTRY.length);
    for (const f of list) {
      const def = FLAG_REGISTRY.find((d) => d.key === f.key)!;
      expect(f.enabled).toBe(def.default);
      expect(f.default_enabled).toBe(def.default);
    }
  });

  test("PATCH toggles a known flag and the override sticks", async () => {
    const { app } = setup();
    const res = await call(app, "PATCH", "/flags/shelf", { enabled: true });
    expect(res.status).toBe(200);
    const updated = (await res.json()) as { key: string; enabled: boolean; updated_at: number | null };
    expect(updated.key).toBe("shelf");
    expect(updated.enabled).toBe(true);
    expect(updated.updated_at).toBeGreaterThan(0);

    const after = (await call(app, "GET", "/flags").then((r) => r.json())) as {
      key: string;
      enabled: boolean;
    }[];
    expect(after.find((f) => f.key === "shelf")!.enabled).toBe(true);
  });

  test("PATCH emits flag.changed on the bus", async () => {
    const { app, deps } = setup();
    const events = await eventsFrom(deps, async () => {
      await call(app, "PATCH", "/flags/shelf", { enabled: true });
    });
    const changed = events.filter((e) => e.type === "flag.changed");
    expect(changed).toHaveLength(1);
    expect(changed[0]).toEqual({ type: "flag.changed", key: "shelf", enabled: true });
  });

  test("PATCH 404 on unknown flag", async () => {
    const { app } = setup();
    const res = await call(app, "PATCH", "/flags/does-not-exist", { enabled: true });
    expect(res.status).toBe(404);
  });

  test("PATCH 400 on missing body", async () => {
    const { app } = setup();
    const res = await call(app, "PATCH", "/flags/shelf", {});
    expect(res.status).toBe(400);
  });

  test("projectFlags is a pure helper", () => {
    const projected = projectFlags(
      [{ key: "x", label: "X", default: false }],
      [{ key: "x", enabled: true, updated_at: 1000 }],
    );
    expect(projected).toEqual([
      {
        key: "x",
        label: "X",
        description: null,
        default_enabled: false,
        enabled: true,
        updated_at: 1000,
      },
    ]);
  });
});
