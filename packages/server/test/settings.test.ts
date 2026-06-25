import { describe, expect, test } from "bun:test";
import { appSettings } from "@backbar/db";
import { buildApp } from "../src/app";
import type { LocalStock, ProcurementSource } from "../src/integrations/va-abc";
import { call, setup } from "./_helpers";

describe("/settings", () => {
  test("GET / is empty until something is set", async () => {
    const { app } = setup();
    const res = await call(app, "GET", "/settings");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("PUT /:key validates + persists an int setting", async () => {
    const { app, deps } = setup();
    const res = await call(app, "PUT", "/settings/va_abc.home_store", { value: 88 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { key: string; value: string };
    expect(body.value).toBe("88");
    expect(appSettings(deps.db).getNumber("va_abc.home_store")).toBe(88);

    // String form also accepted + coerced.
    await call(app, "PUT", "/settings/va_abc.home_store", { value: "152" });
    expect(appSettings(deps.db).getNumber("va_abc.home_store")).toBe(152);

    const all = (await (await call(app, "GET", "/settings")).json()) as Record<string, string>;
    expect(all["va_abc.home_store"]).toBe("152");
  });

  test("PUT null clears the setting", async () => {
    const { app, deps } = setup();
    await call(app, "PUT", "/settings/va_abc.home_store", { value: 88 });
    const res = await call(app, "PUT", "/settings/va_abc.home_store", { value: null });
    expect(res.status).toBe(200);
    expect(appSettings(deps.db).get("va_abc.home_store")).toBeNull();
  });

  test("rejects unknown keys + non-int values", async () => {
    const { app } = setup();
    expect((await call(app, "PUT", "/settings/nope", { value: 1 })).status).toBe(404);
    expect((await call(app, "PUT", "/settings/va_abc.home_store", { value: "abc" })).status).toBe(400);
    expect((await call(app, "PUT", "/settings/va_abc.home_store", { value: 0 })).status).toBe(400);
  });

  test("GET /registry exposes known settings for the UI", async () => {
    const { app } = setup();
    const reg = (await (await call(app, "GET", "/settings/registry")).json()) as { key: string }[];
    expect(reg.some((s) => s.key === "va_abc.home_store")).toBe(true);
  });
});

describe("/products/:id/local gating on the home-store setting", () => {
  // Stub the source so the route never touches the network — we're testing the
  // gate (flag + setting), not the upstream client (covered in va-abc.test.ts).
  function stubbed(result: LocalStock | null) {
    const { deps } = setup();
    const procurement: ProcurementSource = { lookup: async () => result };
    return { deps, app: buildApp({ ...deps, procurement }) };
  }

  const sampleStock: LocalStock = {
    inStock: true,
    priceCents: 2499,
    stores: [{ storeNumber: 207, name: "ABC Store 207", city: "Midlothian", distanceMi: 1.1, qty: 1 }],
    resolvedCode: "042395",
    matchedName: "Planteray Original Dark Rum",
    scope: "live · VA ABC store 88",
  };

  test("disabled when the feature flag is off", async () => {
    const { app } = stubbed(sampleStock);
    const body = (await (await call(app, "GET", "/products/rum/local")).json()) as { reason?: string };
    expect(body.reason).toBe("disabled");
  });

  test("not-configured until the home store setting is set, then resolves", async () => {
    const { app, deps } = stubbed(sampleStock);
    await call(app, "PATCH", "/flags/va-abc", { enabled: true });

    const before = (await (await call(app, "GET", "/products/rum/local")).json()) as {
      available: boolean;
      reason?: string;
    };
    expect(before.available).toBe(false);
    expect(before.reason).toBe("not-configured");

    appSettings(deps.db).set("va_abc.home_store", "88");
    const after = (await (await call(app, "GET", "/products/rum/local")).json()) as {
      available: boolean;
      in_stock?: boolean;
      stores?: { store_number: number }[];
    };
    expect(after.available).toBe(true);
    expect(after.in_stock).toBe(true);
    expect(after.stores?.[0]?.store_number).toBe(207);
  });
});
