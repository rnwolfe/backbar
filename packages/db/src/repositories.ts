import {
  Bottle,
  depletePour,
  Node,
  Pour,
  Product,
  Reading,
  Recipe,
  RecipeIngredient,
  SensorChannel,
  statusAfterDepletion,
  type BottleDepletion,
  type PourBinding,
} from "@backbar/core";
import type { DB } from "./client";
import { uuidv7 } from "./ids";

// ─── helpers ─────────────────────────────────────────────────────────────
const json = (v: unknown) => JSON.stringify(v);
const parseJson = <T>(s: string | null | undefined, fallback: T): T =>
  s == null || s === "" ? fallback : (JSON.parse(s) as T);
const bool = (v: unknown): number => (v ? 1 : 0);

// ─── product ─────────────────────────────────────────────────────────────
interface ProductRow {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  abv: number | null;
  density_g_ml: number | null;
  default_ml: number | null;
  flavor_tags: string;
  notes: string | null;
}

function productFromRow(r: ProductRow): Product {
  return Product.parse({
    id: r.id,
    name: r.name,
    category: r.category,
    subcategory: r.subcategory,
    abv: r.abv,
    density_g_ml: r.density_g_ml,
    default_ml: r.default_ml,
    flavor_tags: parseJson<string[]>(r.flavor_tags, []),
    notes: r.notes,
  });
}

export const products = (db: DB) => ({
  insert(p: Product): Product {
    const parsed = Product.parse(p);
    db.run(
      `INSERT INTO product
       (id, name, category, subcategory, abv, density_g_ml, default_ml, flavor_tags, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        parsed.id,
        parsed.name,
        parsed.category,
        parsed.subcategory ?? null,
        parsed.abv ?? null,
        parsed.density_g_ml ?? null,
        parsed.default_ml ?? null,
        json(parsed.flavor_tags),
        parsed.notes ?? null,
      ],
    );
    return parsed;
  },

  get(id: string): Product | null {
    const row = db
      .query<ProductRow, [string]>("SELECT * FROM product WHERE id = ?")
      .get(id);
    return row ? productFromRow(row) : null;
  },

  list(): Product[] {
    return db
      .query<ProductRow, []>("SELECT * FROM product ORDER BY name")
      .all()
      .map(productFromRow);
  },
});

// ─── bottle ──────────────────────────────────────────────────────────────
interface BottleRow {
  id: string;
  product_id: string;
  slot: string | null;
  tare_g: number | null;
  full_ml: number;
  level_ml: number;
  status: string;
  tracked: number;
  opened_at: number | null;
  purchased_at: number | null;
  price_cents: number | null;
}

function bottleFromRow(r: BottleRow): Bottle {
  return Bottle.parse({
    id: r.id,
    product_id: r.product_id,
    slot: r.slot,
    tare_g: r.tare_g,
    full_ml: r.full_ml,
    level_ml: r.level_ml,
    status: r.status,
    tracked: r.tracked === 1,
    opened_at: r.opened_at,
    purchased_at: r.purchased_at,
    price_cents: r.price_cents,
  });
}

export const bottles = (db: DB) => ({
  insert(b: Bottle): Bottle {
    const parsed = Bottle.parse(b);
    db.run(
      `INSERT INTO bottle
       (id, product_id, slot, tare_g, full_ml, level_ml, status, tracked,
        opened_at, purchased_at, price_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        parsed.id,
        parsed.product_id,
        parsed.slot ?? null,
        parsed.tare_g ?? null,
        parsed.full_ml,
        parsed.level_ml,
        parsed.status,
        bool(parsed.tracked),
        parsed.opened_at ?? null,
        parsed.purchased_at ?? null,
        parsed.price_cents ?? null,
      ],
    );
    return parsed;
  },

  get(id: string): Bottle | null {
    const row = db.query<BottleRow, [string]>("SELECT * FROM bottle WHERE id = ?").get(id);
    return row ? bottleFromRow(row) : null;
  },

  list(): Bottle[] {
    return db.query<BottleRow, []>("SELECT * FROM bottle").all().map(bottleFromRow);
  },

  updateLevel(id: string, level_ml: number, status?: Bottle["status"]): void {
    if (status) {
      db.run("UPDATE bottle SET level_ml = ?, status = ? WHERE id = ?", [level_ml, status, id]);
    } else {
      db.run("UPDATE bottle SET level_ml = ? WHERE id = ?", [level_ml, id]);
    }
  },
});

// ─── reading (append-only) ───────────────────────────────────────────────
interface ReadingRow {
  id: string;
  bottle_id: string;
  level_ml: number;
  source: string;
  confidence: number;
  raw: string | null;
  ts: number;
}

function readingFromRow(r: ReadingRow): Reading {
  return Reading.parse({
    id: r.id,
    bottle_id: r.bottle_id,
    level_ml: r.level_ml,
    source: r.source,
    confidence: r.confidence,
    raw: r.raw ? (JSON.parse(r.raw) as Record<string, unknown>) : null,
    ts: r.ts,
  });
}

export const readings = (db: DB) => ({
  insert(r: Reading): Reading {
    const parsed = Reading.parse(r);
    db.run(
      `INSERT INTO reading (id, bottle_id, level_ml, source, confidence, raw, ts)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        parsed.id,
        parsed.bottle_id,
        parsed.level_ml,
        parsed.source,
        parsed.confidence,
        parsed.raw ? json(parsed.raw) : null,
        parsed.ts,
      ],
    );
    return parsed;
  },

  latestFor(bottle_id: string): Reading | null {
    const row = db
      .query<ReadingRow, [string]>(
        "SELECT * FROM reading WHERE bottle_id = ? ORDER BY ts DESC LIMIT 1",
      )
      .get(bottle_id);
    return row ? readingFromRow(row) : null;
  },

  forBottle(bottle_id: string, limit = 100): Reading[] {
    return db
      .query<ReadingRow, [string, number]>(
        "SELECT * FROM reading WHERE bottle_id = ? ORDER BY ts DESC LIMIT ?",
      )
      .all(bottle_id, limit)
      .map(readingFromRow);
  },
});

// ─── recipe (+ ingredients) ──────────────────────────────────────────────
interface RecipeRow {
  id: string;
  name: string;
  family: string | null;
  method: string | null;
  glass: string | null;
  ice: string | null;
  garnish: string | null;
  instructions: string | null;
  source: string | null;
  provenance: string | null;
  abv_estimate: number | null;
  balance: string | null;
  is_published: number;
  tags: string;
}

interface IngredientRow {
  id: number;
  recipe_id: string;
  ref_type: string;
  ref_id: string | null;
  label: string | null;
  amount: number | null;
  unit: string | null;
  optional: number;
  garnish: number;
  sort: number;
}

function ingredientFromRow(r: IngredientRow): RecipeIngredient {
  return RecipeIngredient.parse({
    ref_type: r.ref_type,
    ref_id: r.ref_id,
    label: r.label,
    amount: r.amount,
    unit: r.unit,
    optional: r.optional === 1,
    garnish: r.garnish === 1,
    sort: r.sort,
  });
}

function recipeFromRow(r: RecipeRow, ingredients: RecipeIngredient[]): Recipe {
  return Recipe.parse({
    id: r.id,
    name: r.name,
    family: r.family,
    method: r.method,
    glass: r.glass,
    ice: r.ice,
    garnish: r.garnish,
    instructions: r.instructions,
    source: r.source,
    provenance: r.provenance,
    abv_estimate: r.abv_estimate,
    balance: r.balance ? JSON.parse(r.balance) : null,
    is_published: r.is_published === 1,
    tags: parseJson<string[]>(r.tags, []),
    ingredients,
  });
}

export const recipes = (db: DB) => ({
  insert(r: Recipe): Recipe {
    const parsed = Recipe.parse(r);
    db.transaction(() => {
      db.run(
        `INSERT INTO recipe
         (id, name, family, method, glass, ice, garnish, instructions,
          source, provenance, abv_estimate, balance, is_published, tags)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          parsed.id,
          parsed.name,
          parsed.family ?? null,
          parsed.method ?? null,
          parsed.glass ?? null,
          parsed.ice ?? null,
          parsed.garnish ?? null,
          parsed.instructions ?? null,
          parsed.source ?? null,
          parsed.provenance ?? null,
          parsed.abv_estimate ?? null,
          parsed.balance ? json(parsed.balance) : null,
          bool(parsed.is_published),
          json(parsed.tags),
        ],
      );
      for (const ing of parsed.ingredients) {
        db.run(
          `INSERT INTO recipe_ingredient
           (recipe_id, ref_type, ref_id, label, amount, unit, optional, garnish, sort)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            parsed.id,
            ing.ref_type,
            ing.ref_id ?? null,
            ing.label ?? null,
            ing.amount ?? null,
            ing.unit ?? null,
            bool(ing.optional),
            bool(ing.garnish),
            ing.sort,
          ],
        );
      }
    })();
    return parsed;
  },

  get(id: string): Recipe | null {
    const row = db.query<RecipeRow, [string]>("SELECT * FROM recipe WHERE id = ?").get(id);
    if (!row) return null;
    const ings = db
      .query<IngredientRow, [string]>(
        "SELECT * FROM recipe_ingredient WHERE recipe_id = ? ORDER BY sort, id",
      )
      .all(id)
      .map(ingredientFromRow);
    return recipeFromRow(row, ings);
  },

  list(): Recipe[] {
    const rows = db.query<RecipeRow, []>("SELECT * FROM recipe ORDER BY name").all();
    return rows.map((r) => {
      const ings = db
        .query<IngredientRow, [string]>(
          "SELECT * FROM recipe_ingredient WHERE recipe_id = ? ORDER BY sort, id",
        )
        .all(r.id)
        .map(ingredientFromRow);
      return recipeFromRow(r, ings);
    });
  },
});

// ─── pour ────────────────────────────────────────────────────────────────
interface PourRow {
  id: string;
  recipe_id: string | null;
  made_at: number;
  bottles_used: string;
}

/** Input to `pours.apply()` — id/timestamps are filled in if omitted. */
export interface PourApplyInput {
  id?: string;
  recipe_id?: string | null;
  made_at?: number;
  bindings: PourBinding[];
}

/** Outcome of `pours.apply()` — useful for WS broadcast in task-004. */
export interface PourApplyResult {
  pour: Pour;
  depletions: BottleDepletion[];
  readings: Reading[];
}

export const pours = (db: DB) => ({
  insert(p: Pour): Pour {
    const parsed = Pour.parse(p);
    db.run(
      `INSERT INTO pour (id, recipe_id, made_at, bottles_used) VALUES (?, ?, ?, ?)`,
      [parsed.id, parsed.recipe_id ?? null, parsed.made_at, json(parsed.bottles_used)],
    );
    return parsed;
  },

  /**
   * Apply a pour against current inventory — spec §1/§2 + §5 pour path.
   *
   * Transactionally, per binding: write a `reading{source:'pour'}` at the
   * post-pour level, update `bottle.level_ml`, flip `status='empty'` when the
   * residual drops to/under `EMPTY_THRESHOLD_ML`. The `pour` row is inserted
   * last so a mid-pour failure leaves no orphan pour record.
   *
   * The pour amount and reading level come straight from `depletePour()` so
   * an HTTP `/pour` route and a future MQTT-derived pour use the same math.
   */
  apply(input: PourApplyInput): PourApplyResult {
    const made_at = input.made_at ?? Date.now();
    const pour = Pour.parse({
      id: input.id ?? uuidv7(),
      recipe_id: input.recipe_id ?? null,
      made_at,
      bottles_used: input.bindings,
    });

    // Snapshot current levels for every bottle the pour touches.
    const levels = new Map<string, number>();
    const bottleStatuses = new Map<string, Bottle["status"]>();
    for (const b of pour.bottles_used) {
      const row = db
        .query<BottleRow, [string]>("SELECT * FROM bottle WHERE id = ?")
        .get(b.bottle_id);
      if (!row) throw new Error(`pour references unknown bottle: ${b.bottle_id}`);
      levels.set(b.bottle_id, row.level_ml);
      bottleStatuses.set(b.bottle_id, row.status as Bottle["status"]);
    }

    // Pure math — throws on negative ml / over-draw before any IO.
    const depletions = depletePour(pour.bottles_used, levels);
    const readings: Reading[] = [];

    db.transaction(() => {
      for (const d of depletions) {
        if (d.ml === 0) continue; // non-depleting binding — no IO

        const reading = Reading.parse({
          id: uuidv7(),
          bottle_id: d.bottle_id,
          level_ml: d.new_ml,
          source: "pour",
          confidence: 1,
          raw: { recipe_id: pour.recipe_id, pour_id: pour.id, ml: d.ml },
          ts: made_at,
        });
        db.run(
          `INSERT INTO reading (id, bottle_id, level_ml, source, confidence, raw, ts)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            reading.id,
            reading.bottle_id,
            reading.level_ml,
            reading.source,
            reading.confidence,
            json(reading.raw),
            reading.ts,
          ],
        );
        readings.push(reading);

        const before = bottleStatuses.get(d.bottle_id)!;
        const after = statusAfterDepletion(before, d);
        if (after !== before) {
          db.run("UPDATE bottle SET level_ml = ?, status = ? WHERE id = ?", [
            d.new_ml,
            after,
            d.bottle_id,
          ]);
        } else {
          db.run("UPDATE bottle SET level_ml = ? WHERE id = ?", [d.new_ml, d.bottle_id]);
        }
      }

      db.run(
        `INSERT INTO pour (id, recipe_id, made_at, bottles_used) VALUES (?, ?, ?, ?)`,
        [pour.id, pour.recipe_id ?? null, pour.made_at, json(pour.bottles_used)],
      );
    })();

    return { pour, depletions, readings };
  },

  list(limit = 100): Pour[] {
    return db
      .query<PourRow, [number]>("SELECT * FROM pour ORDER BY made_at DESC LIMIT ?")
      .all(limit)
      .map((r) =>
        Pour.parse({
          id: r.id,
          recipe_id: r.recipe_id,
          made_at: r.made_at,
          bottles_used: JSON.parse(r.bottles_used),
        }),
      );
  },
});

// ─── sensor_channel ──────────────────────────────────────────────────────
interface SensorChannelRow {
  device_id: string;
  channel: number;
  slot: string;
  bottle_id: string | null;
  cal_slope: number | null;
  cal_offset: number | null;
}

export const sensorChannels = (db: DB) => ({
  upsert(c: SensorChannel): SensorChannel {
    const parsed = SensorChannel.parse(c);
    db.run(
      `INSERT INTO sensor_channel (device_id, channel, slot, bottle_id, cal_slope, cal_offset)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(device_id, channel) DO UPDATE SET
         slot = excluded.slot,
         bottle_id = excluded.bottle_id,
         cal_slope = excluded.cal_slope,
         cal_offset = excluded.cal_offset`,
      [
        parsed.device_id,
        parsed.channel,
        parsed.slot,
        parsed.bottle_id ?? null,
        parsed.cal_slope ?? null,
        parsed.cal_offset ?? null,
      ],
    );
    return parsed;
  },

  list(): SensorChannel[] {
    return db
      .query<SensorChannelRow, []>(
        "SELECT * FROM sensor_channel ORDER BY device_id, channel",
      )
      .all()
      .map((r) => SensorChannel.parse(r));
  },
});

// ─── node (fleet health) ─────────────────────────────────────────────────
interface NodeRow {
  device_id: string;
  label: string | null;
  last_seen: number | null;
  status: string;
  fw_version: string | null;
}

export const nodes = (db: DB) => ({
  upsert(n: Node): Node {
    const parsed = Node.parse(n);
    db.run(
      `INSERT INTO node (device_id, label, last_seen, status, fw_version)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET
         label = excluded.label,
         last_seen = excluded.last_seen,
         status = excluded.status,
         fw_version = excluded.fw_version`,
      [
        parsed.device_id,
        parsed.label ?? null,
        parsed.last_seen ?? null,
        parsed.status,
        parsed.fw_version ?? null,
      ],
    );
    return parsed;
  },

  list(): Node[] {
    return db
      .query<NodeRow, []>("SELECT * FROM node ORDER BY device_id")
      .all()
      .map((r) => Node.parse(r));
  },
});

// ─── derived views ───────────────────────────────────────────────────────
export const queries = (db: DB) => ({
  lowStock(): Bottle[] {
    return db.query<BottleRow, []>("SELECT * FROM low_stock").all().map(bottleFromRow);
  },

  shoppingList(): { product_id: string; name: string; category: string; subcategory: string | null; healthy_bottles: number }[] {
    return db
      .query<
        {
          product_id: string;
          name: string;
          category: string;
          subcategory: string | null;
          healthy_bottles: number;
        },
        []
      >("SELECT * FROM shopping_list ORDER BY name")
      .all();
  },
});
