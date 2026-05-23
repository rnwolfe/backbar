import { describe, expect, test } from "bun:test";
import { openMemory } from "../src/client";
import { appliedVersions, migrate } from "../src/migrations";

interface TableRow {
  name: string;
  type: string;
}

const EXPECTED_TABLES = [
  "product",
  "bottle",
  "reading",
  "recipe",
  "recipe_ingredient",
  "pour",
  "sensor_channel",
  "node",
];

const EXPECTED_VIEWS = ["low_stock", "shopping_list"];

describe("migrations", () => {
  test("apply 0001 + 0002 and create the §1 tables + views", () => {
    const db = openMemory();
    const ran = migrate(db);
    expect(ran.length).toBeGreaterThanOrEqual(2);
    expect(ran).toContain("0001");
    expect(ran).toContain("0002");

    const objects = db
      .query<TableRow, []>(
        "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name <> '_migrations'",
      )
      .all();
    const names = new Set(objects.map((o) => o.name));
    for (const tbl of EXPECTED_TABLES) expect(names.has(tbl)).toBe(true);
    for (const view of EXPECTED_VIEWS) expect(names.has(view)).toBe(true);

    // low_stock and shopping_list must be views, not tables.
    const lowStock = objects.find((o) => o.name === "low_stock");
    const shopping = objects.find((o) => o.name === "shopping_list");
    expect(lowStock?.type).toBe("view");
    expect(shopping?.type).toBe("view");
  });

  test("is idempotent — second run applies nothing", () => {
    const db = openMemory();
    migrate(db);
    const second = migrate(db);
    expect(second).toEqual([]);
    const applied = appliedVersions(db);
    expect(applied.map((a) => a.version)).toContain("0001");
  });

  test("reading is append-only — UPDATE is rejected", () => {
    const db = openMemory();
    migrate(db);
    db.exec(`
      INSERT INTO product (id, name, category) VALUES ('gin', 'Gin', 'gin');
      INSERT INTO bottle (id, product_id, full_ml, level_ml, status) VALUES ('b1', 'gin', 750, 750, 'open');
      INSERT INTO reading (id, bottle_id, level_ml, source, ts)
        VALUES ('r1', 'b1', 700, 'manual', 1);
    `);
    expect(() => db.run("UPDATE reading SET level_ml = 0 WHERE id = 'r1'")).toThrow(
      /append-only/,
    );
  });
});
