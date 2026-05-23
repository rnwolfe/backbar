import { describe, expect, test } from "bun:test";
import { EMPTY_THRESHOLD_ML } from "@backbar/core";
import { openMemory } from "../src/client";
import { migrate } from "../src/migrations";
import { bottles, pours, products, readings, recipes } from "../src/repositories";

function setup() {
  const db = openMemory();
  migrate(db);
  products(db).insert({ id: "gin", name: "Generic Gin", category: "gin", flavor_tags: [] });
  products(db).insert({ id: "vermouth", name: "Sweet Vermouth", category: "vermouth", flavor_tags: [] });
  // Provide a real recipe so pour.recipe_id FK is satisfiable; tests that
  // don't care about it pass null.
  recipes(db).insert({
    id: "daiquiri",
    name: "Daiquiri",
    family: "sour",
    method: "shake",
    is_published: false,
    tags: [],
    ingredients: [
      { ref_type: "category", ref_id: "rum", amount: 60, unit: "ml", optional: false, garnish: false, sort: 0 },
    ],
  });
  bottles(db).insert({
    id: "b-gin", product_id: "gin", full_ml: 750, level_ml: 700, status: "open", tracked: false,
  });
  bottles(db).insert({
    id: "b-vermouth", product_id: "vermouth", full_ml: 750, level_ml: 500, status: "open", tracked: false,
  });
  return db;
}

describe("pours.apply() — depletion + reading per binding", () => {
  test("decrements bottle.level_ml exactly per binding", () => {
    const db = setup();
    const result = pours(db).apply({
      recipe_id: null,
      bindings: [
        { bottle_id: "b-gin", ml: 60 },
        { bottle_id: "b-vermouth", ml: 30 },
      ],
    });

    expect(bottles(db).get("b-gin")?.level_ml).toBe(640);
    expect(bottles(db).get("b-vermouth")?.level_ml).toBe(470);
    expect(result.depletions.map((d) => d.ml)).toEqual([60, 30]);
  });

  test("writes a reading with source='pour' per depleting binding", () => {
    const db = setup();
    pours(db).apply({
      recipe_id: null,
      bindings: [
        { bottle_id: "b-gin", ml: 30 },
        { bottle_id: "b-vermouth", ml: 30 },
      ],
    });

    const ginLog = readings(db).forBottle("b-gin");
    expect(ginLog).toHaveLength(1);
    expect(ginLog[0]?.source).toBe("pour");
    expect(ginLog[0]?.level_ml).toBe(670);

    const vermouthLog = readings(db).forBottle("b-vermouth");
    expect(vermouthLog).toHaveLength(1);
    expect(vermouthLog[0]?.source).toBe("pour");
  });

  test("ml=0 binding (non-depleting unit) leaves bottle + reading log untouched", () => {
    const db = setup();
    pours(db).apply({
      recipe_id: null,
      bindings: [
        { bottle_id: "b-gin", ml: 60 },
        // a binding produced for a 'leaf' (non-depleting) ingredient
        { bottle_id: "b-vermouth", ml: 0 },
      ],
    });

    expect(bottles(db).get("b-vermouth")?.level_ml).toBe(500);
    expect(readings(db).forBottle("b-vermouth")).toHaveLength(0);
  });

  test("residual <= EMPTY_THRESHOLD_ML flips status to empty", () => {
    const db = setup();
    pours(db).apply({
      recipe_id: null,
      bindings: [{ bottle_id: "b-gin", ml: 700 - (EMPTY_THRESHOLD_ML - 1) }],
    });

    const after = bottles(db).get("b-gin")!;
    expect(after.level_ml).toBeLessThanOrEqual(EMPTY_THRESHOLD_ML);
    expect(after.status).toBe("empty");
  });

  test("residual just above threshold keeps status='open'", () => {
    const db = setup();
    pours(db).apply({
      recipe_id: null,
      bindings: [{ bottle_id: "b-gin", ml: 700 - (EMPTY_THRESHOLD_ML + 1) }],
    });

    const after = bottles(db).get("b-gin")!;
    expect(after.status).toBe("open");
  });

  test("over-draw rejects atomically — no pour, no reading, no level change", () => {
    const db = setup();
    expect(() =>
      pours(db).apply({
        recipe_id: null,
        bindings: [
          { bottle_id: "b-gin", ml: 30 },
          { bottle_id: "b-vermouth", ml: 5000 }, // over-draw
        ],
      }),
    ).toThrow();

    expect(bottles(db).get("b-gin")?.level_ml).toBe(700);
    expect(bottles(db).get("b-vermouth")?.level_ml).toBe(500);
    expect(pours(db).list()).toHaveLength(0);
    expect(readings(db).forBottle("b-gin")).toHaveLength(0);
  });

  test("inserts the pour row with bottles_used and a uuidv7 id", () => {
    const db = setup();
    const { pour } = pours(db).apply({
      recipe_id: null,
      bindings: [{ bottle_id: "b-gin", ml: 60 }],
    });

    expect(pour.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    const rows = pours(db).list();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.bottles_used).toEqual([{ bottle_id: "b-gin", ml: 60 }]);
  });

  test("reading.raw carries pour provenance for log replay", () => {
    const db = setup();
    const { pour } = pours(db).apply({
      recipe_id: "daiquiri",
      bindings: [{ bottle_id: "b-gin", ml: 60 }],
    });
    const r = readings(db).forBottle("b-gin")[0]!;
    expect(r.raw).toMatchObject({
      recipe_id: "daiquiri",
      pour_id: pour.id,
      ml: 60,
    });
  });

  test("unknown bottle rejects before any write", () => {
    const db = setup();
    expect(() =>
      pours(db).apply({ bindings: [{ bottle_id: "ghost", ml: 30 }] }),
    ).toThrow(/unknown bottle/);
    expect(pours(db).list()).toHaveLength(0);
  });
});
