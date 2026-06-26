import { describe, expect, test } from "bun:test";
import { components as componentsRepo, recipes as recipesRepo } from "@backbar/db";
import { call, setup } from "./_helpers";

const orgeat = {
  id: "mazapan-orgeat",
  name: "Mazapán Orgeat",
  kind: "orgeat",
  instructions: "Blend until smooth.",
  keeps: "2 weeks refrigerated",
  ingredients: [
    { ref_type: "freeform", label: "almond milk", amount: 4, unit: "cup", sort: 0 },
    { ref_type: "freeform", label: "sugar", amount: 3, unit: "cup", sort: 1 },
  ],
};

describe("/components CRUD", () => {
  test("create → get → list → update → delete", async () => {
    const { app, deps } = setup();

    const created = await call(app, "POST", "/components", orgeat);
    expect(created.status).toBe(201);

    const got = (await (await call(app, "GET", "/components/mazapan-orgeat")).json()) as {
      name: string;
      ingredients: unknown[];
      used_by: unknown[];
    };
    expect(got.name).toBe("Mazapán Orgeat");
    expect(got.ingredients).toHaveLength(2);
    expect(got.used_by).toEqual([]);

    expect((await (await call(app, "GET", "/components")).json()) as unknown[]).toHaveLength(1);

    await call(app, "PUT", "/components/mazapan-orgeat", { ...orgeat, keeps: "3 weeks" });
    expect(componentsRepo(deps.db).get("mazapan-orgeat")?.keeps).toBe("3 weeks");

    const del = await call(app, "DELETE", "/components/mazapan-orgeat");
    expect(del.status).toBe(200);
    expect(componentsRepo(deps.db).get("mazapan-orgeat")).toBeNull();
  });

  test("duplicate id → 409", async () => {
    const { app } = setup();
    await call(app, "POST", "/components", orgeat);
    expect((await call(app, "POST", "/components", orgeat)).status).toBe(409);
  });

  test("delete is blocked while a recipe references the component (409 in-use)", async () => {
    const { app, deps } = setup();
    await call(app, "POST", "/components", orgeat);
    recipesRepo(deps.db).insert({
      id: "mazapan-infante",
      name: "Mazapán Infante",
      method: "shake",
      tags: [],
      ingredients: [
        { ref_type: "category", ref_id: "rum", amount: 2, unit: "oz", optional: false, garnish: false, sort: 0 },
        {
          ref_type: "component",
          ref_id: "mazapan-orgeat",
          label: "mazapán orgeat",
          amount: 0.75,
          unit: "oz",
          optional: false,
          garnish: false,
          sort: 1,
        },
      ],
    });

    const del = await call(app, "DELETE", "/components/mazapan-orgeat");
    expect(del.status).toBe(409);
    expect(componentsRepo(deps.db).get("mazapan-orgeat")).not.toBeNull();

    // The recipe's GET /:id surfaces it under used_by.
    const got = (await (await call(app, "GET", "/components/mazapan-orgeat")).json()) as {
      used_by: { id: string }[];
    };
    expect(got.used_by.map((r) => r.id)).toContain("mazapan-infante");
  });
});
