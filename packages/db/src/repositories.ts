import {
  Bottle,
  Category,
  depletePour,
  FlavorProfile,
  Node,
  Pour,
  Product,
  ProductTag,
  Reading,
  Recipe,
  RecipeIngredient,
  SensorChannel,
  statusAfterDepletion,
  type BottleDepletion,
  type IngredientSubstitute,
  type PairingEdge,
  type PourBinding,
  type RootTemplate,
} from "@backbar/core";
import type { DB } from "./client";
import { uuidv7 } from "./ids";

// ─── helpers ─────────────────────────────────────────────────────────────
const json = (v: unknown) => JSON.stringify(v);
const parseJson = <T>(s: string | null | undefined, fallback: T): T =>
  s == null || s === "" ? fallback : (JSON.parse(s) as T);
const bool = (v: unknown): number => (v ? 1 : 0);

// ─── feature_flag (operator-toggleable, sparse) ──────────────────────────
interface FeatureFlagRow {
  key: string;
  enabled: number;
  updated_at: number;
}

export interface FeatureFlagOverride {
  key: string;
  enabled: boolean;
  updated_at: number;
}

export const featureFlags = (db: DB) => ({
  /** Read every override row. Missing keys fall back to registry defaults. */
  listOverrides(): FeatureFlagOverride[] {
    return db
      .query<FeatureFlagRow, []>("SELECT * FROM feature_flag")
      .all()
      .map((r) => ({ key: r.key, enabled: r.enabled === 1, updated_at: r.updated_at }));
  },

  getOverride(key: string): FeatureFlagOverride | null {
    const row = db
      .query<FeatureFlagRow, [string]>("SELECT * FROM feature_flag WHERE key = ?")
      .get(key);
    return row ? { key: row.key, enabled: row.enabled === 1, updated_at: row.updated_at } : null;
  },

  /** Upsert an override. Returns the persisted row. */
  setOverride(key: string, enabled: boolean): FeatureFlagOverride {
    const ts = Date.now();
    db.run(
      `INSERT INTO feature_flag (key, enabled, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`,
      [key, enabled ? 1 : 0, ts],
    );
    return { key, enabled, updated_at: ts };
  },

  clearOverride(key: string): void {
    db.run("DELETE FROM feature_flag WHERE key = ?", [key]);
  },
});

// ─── app_setting (generic operator key/value) ──────────────────────────────
interface AppSettingRow {
  key: string;
  value: string;
  updated_at: number;
}

export interface AppSetting {
  key: string;
  value: string;
  updated_at: number;
}

export const appSettings = (db: DB) => ({
  /** All set values as a plain `{ key: value }` map. */
  all(): Record<string, string> {
    const rows = db.query<AppSettingRow, []>("SELECT * FROM app_setting").all();
    const out: Record<string, string> = {};
    for (const r of rows) out[r.key] = r.value;
    return out;
  },

  get(key: string): string | null {
    const row = db
      .query<AppSettingRow, [string]>("SELECT * FROM app_setting WHERE key = ?")
      .get(key);
    return row ? row.value : null;
  },

  /** Convenience: parse a setting as an integer, or null when unset/non-numeric. */
  getNumber(key: string): number | null {
    const raw = this.get(key);
    if (raw == null) return null;
    const n = Number.parseInt(raw, 10);
    return Number.isInteger(n) ? n : null;
  },

  /** Upsert a value. Returns the persisted row. */
  set(key: string, value: string): AppSetting {
    const ts = Date.now();
    db.run(
      `INSERT INTO app_setting (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, value, ts],
    );
    return { key, value, updated_at: ts };
  },

  delete(key: string): void {
    db.run("DELETE FROM app_setting WHERE key = ?", [key]);
  },
});

// ─── category (palette registry) ─────────────────────────────────────────
interface CategoryRow {
  id: string;
  label: string;
  hue: number;
  sort_order: number;
  created_at: number;
}

function categoryFromRow(r: CategoryRow): Category {
  return Category.parse(r);
}

export const categories = (db: DB) => ({
  list(): Category[] {
    return db
      .query<CategoryRow, []>("SELECT * FROM category ORDER BY sort_order, label")
      .all()
      .map(categoryFromRow);
  },

  get(id: string): Category | null {
    const row = db
      .query<CategoryRow, [string]>("SELECT * FROM category WHERE id = ?")
      .get(id);
    return row ? categoryFromRow(row) : null;
  },

  insert(c: Omit<Category, "created_at"> & { created_at?: number }): Category {
    const parsed = Category.parse({ ...c, created_at: c.created_at ?? Date.now() });
    db.run(
      "INSERT INTO category (id, label, hue, sort_order, created_at) VALUES (?, ?, ?, ?, ?)",
      [parsed.id, parsed.label, parsed.hue, parsed.sort_order, parsed.created_at],
    );
    return parsed;
  },

  update(id: string, patch: Partial<Pick<Category, "label" | "hue" | "sort_order">>): Category | null {
    const existing = this.get(id);
    if (!existing) return null;
    const merged = { ...existing, ...patch };
    db.run("UPDATE category SET label = ?, hue = ?, sort_order = ? WHERE id = ?", [
      merged.label,
      merged.hue,
      merged.sort_order,
      id,
    ]);
    return merged;
  },

  /**
   * How many products currently reference this category id? Used by the
   * DELETE handler to refuse deleting in-use rows.
   */
  productCount(id: string): number {
    return (
      db
        .query<{ c: number }, [string]>("SELECT COUNT(*) AS c FROM product WHERE category = ?")
        .get(id)?.c ?? 0
    );
  },

  delete(id: string): void {
    db.run("DELETE FROM category WHERE id = ?", [id]);
  },
});

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
  // §3a structured metadata
  distillery: string | null;
  origin_country: string | null;
  origin_region: string | null;
  producer_url: string | null;
  age_statement_y: number | null;
  // procurement integration (va-abc)
  va_abc_code: string | null;
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
    distillery: r.distillery,
    origin_country: r.origin_country,
    origin_region: r.origin_region,
    producer_url: r.producer_url,
    age_statement_y: r.age_statement_y,
    va_abc_code: r.va_abc_code,
  });
}

export const products = (db: DB) => ({
  /**
   * Wipe every product. Caller is responsible for clearing bottles first —
   * `bottle.product_id` is `ON DELETE RESTRICT`, so a non-empty bottle table
   * will block this and the SQLite error message ("FOREIGN KEY constraint
   * failed") is intentionally surfaced rather than swallowed. Returns the
   * count counted *before* the delete so cascade rows don't inflate it.
   */
  deleteAll(): number {
    const n = db.query<{ c: number }, []>("SELECT COUNT(*) AS c FROM product").get()!.c;
    db.run("DELETE FROM product");
    return n;
  },

  insert(p: Product): Product {
    const parsed = Product.parse(p);
    db.run(
      `INSERT INTO product
       (id, name, category, subcategory, abv, density_g_ml, default_ml, flavor_tags, notes,
        distillery, origin_country, origin_region, producer_url, age_statement_y, va_abc_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        parsed.distillery ?? null,
        parsed.origin_country ?? null,
        parsed.origin_region ?? null,
        parsed.producer_url ?? null,
        parsed.age_statement_y ?? null,
        parsed.va_abc_code ?? null,
      ],
    );
    return parsed;
  },

  /**
   * Persist the resolved Virginia ABC SKU for a product. Called by the
   * procurement route after a Coveo name-search resolves a code, so future
   * local-stock lookups are deterministic (and operator-correctable via PATCH).
   */
  setVaAbcCode(id: string, code: string | null): void {
    db.run("UPDATE product SET va_abc_code = ? WHERE id = ?", [code, id]);
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

// ─── product_tag (§3b namespaced taxonomy) ──────────────────────────────
interface ProductTagRow {
  product_id: string;
  namespace: string;
  value: string;
}

function productTagFromRow(r: ProductTagRow): ProductTag {
  return ProductTag.parse({
    product_id: r.product_id,
    namespace: r.namespace,
    value: r.value,
  });
}

export const productTags = (db: DB) => ({
  /** Upsert is implicit — primary key is (product_id, namespace, value). */
  add(t: ProductTag): ProductTag {
    const parsed = ProductTag.parse(t);
    db.run(
      `INSERT OR IGNORE INTO product_tag (product_id, namespace, value) VALUES (?, ?, ?)`,
      [parsed.product_id, parsed.namespace, parsed.value],
    );
    return parsed;
  },

  remove(product_id: string, namespace: string, value: string): void {
    db.run("DELETE FROM product_tag WHERE product_id = ? AND namespace = ? AND value = ?", [
      product_id,
      namespace,
      value,
    ]);
  },

  /** Wipe all tags for a product — used when replacing a product's tag set wholesale. */
  removeAllFor(product_id: string): number {
    const before = db
      .query<{ c: number }, [string]>("SELECT COUNT(*) AS c FROM product_tag WHERE product_id = ?")
      .get(product_id)!.c;
    db.run("DELETE FROM product_tag WHERE product_id = ?", [product_id]);
    return before;
  },

  forProduct(product_id: string): ProductTag[] {
    return db
      .query<ProductTagRow, [string]>(
        "SELECT * FROM product_tag WHERE product_id = ? ORDER BY namespace, value",
      )
      .all(product_id)
      .map(productTagFromRow);
  },

  /** All tags across the catalog — for the makeability matcher join. */
  list(): ProductTag[] {
    return db
      .query<ProductTagRow, []>(
        "SELECT * FROM product_tag ORDER BY product_id, namespace, value",
      )
      .all()
      .map(productTagFromRow);
  },

  /** Distinct namespaces present in the catalog (for UI filters). */
  namespaces(): string[] {
    return db
      .query<{ namespace: string }, []>(
        "SELECT DISTINCT namespace FROM product_tag ORDER BY namespace",
      )
      .all()
      .map((r) => r.namespace);
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
  /**
   * Wipe every bottle. Readings cascade automatically (ON DELETE CASCADE on
   * `reading.bottle_id`); `sensor_channel.bottle_id` is set NULL by the same
   * mechanism, so the device-mapping survives a bar reset. Returns the
   * pre-delete count so cascade rows don't inflate it.
   */
  deleteAll(): number {
    const n = db.query<{ c: number }, []>("SELECT COUNT(*) AS c FROM bottle").get()!.c;
    db.run("DELETE FROM bottle");
    return n;
  },

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

  /**
   * Permanently remove a single bottle. Like {@link deleteAll}, dependents are
   * handled by the schema's FK actions: `reading` rows cascade-delete, while
   * `sensor_channel.bottle_id` and `pour_binding.bottle_id` are set NULL — so
   * the channel keeps its device mapping and historical pours keep their ml
   * (just lose the bottle link). Returns false when no such bottle existed.
   */
  remove(id: string): boolean {
    const { changes } = db.run("DELETE FROM bottle WHERE id = ?", [id]);
    return changes > 0;
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
  /**
   * Wipe every recipe. `recipe_ingredient` rows cascade; `pour.recipe_id`
   * is set NULL so historical pours survive (they keep their bottle bindings
   * and made_at — they just stop pointing at a recipe row). Returns the
   * pre-delete recipe count so cascade rows don't inflate it.
   */
  deleteAll(): number {
    const n = db.query<{ c: number }, []>("SELECT COUNT(*) AS c FROM recipe").get()!.c;
    db.run("DELETE FROM recipe");
    return n;
  },

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

  /**
   * Publish exactly `ids`: set `is_published = 1` for them and `0` for every
   * other recipe, in one transaction. This is the guest-menu publish action —
   * the operator's selection becomes the complete published set (the live
   * `/guest/menu` projection then shows the published ∩ makeable recipes).
   */
  publishOnly(ids: string[]): void {
    db.transaction(() => {
      db.run("UPDATE recipe SET is_published = 0");
      for (const id of ids) {
        db.run("UPDATE recipe SET is_published = 1 WHERE id = ?", [id]);
      }
    })();
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

// ─── flavor grounding (corpus tables; specs/ai-grounding-corpus.md) ────────

interface FlavorProfileRow {
  ref: string;
  ref_type: string;
  descriptors: string;
  axes: string;
  typical_abv: number;
  intensity: number;
  role: string;
  notes: string | null;
}

function flavorProfileFromRow(r: FlavorProfileRow): FlavorProfile {
  return FlavorProfile.parse({
    ref: r.ref,
    ref_type: r.ref_type,
    descriptors: parseJson<string[]>(r.descriptors, []),
    axes: parseJson(r.axes, {}),
    typical_abv: r.typical_abv,
    intensity: r.intensity,
    role: r.role,
    notes: r.notes ?? undefined,
  });
}

export const flavorProfiles = (db: DB) => ({
  upsert(p: FlavorProfile): void {
    const parsed = FlavorProfile.parse(p);
    db.run(
      `INSERT INTO flavor_profile (ref, ref_type, descriptors, axes, typical_abv, intensity, role, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(ref) DO UPDATE SET
         ref_type=excluded.ref_type, descriptors=excluded.descriptors, axes=excluded.axes,
         typical_abv=excluded.typical_abv, intensity=excluded.intensity, role=excluded.role, notes=excluded.notes`,
      [
        parsed.ref,
        parsed.ref_type,
        json(parsed.descriptors),
        json(parsed.axes),
        parsed.typical_abv,
        parsed.intensity,
        parsed.role,
        parsed.notes ?? null,
      ],
    );
  },
  get(ref: string): FlavorProfile | null {
    const row = db.query<FlavorProfileRow, [string]>("SELECT * FROM flavor_profile WHERE ref = ?").get(ref);
    return row ? flavorProfileFromRow(row) : null;
  },
  list(): FlavorProfile[] {
    return db.query<FlavorProfileRow, []>("SELECT * FROM flavor_profile ORDER BY ref").all().map(flavorProfileFromRow);
  },
});

export const flavorPairings = (db: DB) => ({
  /** Set the co-occurrence signal without disturbing molecular (and vice-versa). */
  setCooccurrence(a: string, b: string, score: number): void {
    const [x, y] = a <= b ? [a, b] : [b, a];
    db.run(
      `INSERT INTO flavor_pairing (a, b, cooccurrence) VALUES (?, ?, ?)
       ON CONFLICT(a, b) DO UPDATE SET cooccurrence=excluded.cooccurrence`,
      [x, y, score],
    );
  },
  setMolecular(a: string, b: string, score: number): void {
    const [x, y] = a <= b ? [a, b] : [b, a];
    db.run(
      `INSERT INTO flavor_pairing (a, b, molecular) VALUES (?, ?, ?)
       ON CONFLICT(a, b) DO UPDATE SET molecular=excluded.molecular`,
      [x, y, score],
    );
  },
  get(a: string, b: string): PairingEdge | null {
    const [x, y] = a <= b ? [a, b] : [b, a];
    const row = db
      .query<{ a: string; b: string; cooccurrence: number | null; molecular: number | null }, [string, string]>(
        "SELECT * FROM flavor_pairing WHERE a = ? AND b = ?",
      )
      .get(x, y);
    return row ? { a: row.a, b: row.b, cooccurrence: row.cooccurrence, molecular: row.molecular } : null;
  },
  /** Every edge touching `ref` (either side), partner first. */
  forRef(ref: string): { partner: string; cooccurrence: number | null; molecular: number | null }[] {
    return db
      .query<
        { partner: string; cooccurrence: number | null; molecular: number | null },
        [string, string, string]
      >(
        `SELECT CASE WHEN a = ? THEN b ELSE a END AS partner, cooccurrence, molecular
         FROM flavor_pairing WHERE a = ? OR b = ?`,
      )
      .all(ref, ref, ref);
  },
});

export const ingredientSubstitutes = (db: DB) => ({
  add(s: IngredientSubstitute): void {
    db.run(
      `INSERT OR REPLACE INTO ingredient_substitute (ref, substitute_ref, note) VALUES (?, ?, ?)`,
      [s.ref, s.substitute_ref, s.note ?? null],
    );
  },
  forRef(ref: string): IngredientSubstitute[] {
    return db
      .query<{ ref: string; substitute_ref: string; note: string | null }, [string]>(
        "SELECT * FROM ingredient_substitute WHERE ref = ?",
      )
      .all(ref)
      .map((r) => ({ ref: r.ref, substitute_ref: r.substitute_ref, note: r.note ?? undefined }));
  },
});

export const rootTemplates = (db: DB) => ({
  upsert(t: RootTemplate): void {
    db.run(
      `INSERT OR REPLACE INTO root_template (root, family, skeleton, method, ratio, roles, derived)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [t.root, t.family, t.skeleton, t.method, json(t.ratio), json(t.roles), json(t.derived)],
    );
  },
  list(): RootTemplate[] {
    return db
      .query<
        { root: string; family: string; skeleton: string; method: string; ratio: string; roles: string; derived: string },
        []
      >("SELECT * FROM root_template ORDER BY root")
      .all()
      .map((r) => ({
        root: r.root,
        family: r.family,
        skeleton: r.skeleton,
        method: r.method as RootTemplate["method"],
        ratio: parseJson<number[]>(r.ratio, []),
        roles: parseJson<RootTemplate["roles"]>(r.roles, []),
        derived: parseJson<string[]>(r.derived, []),
      }));
  },
});

// ─── chat threads (agentic chat persistence; specs/ai-chat-spike.md) ───────

export interface ChatThreadRow {
  id: string;
  title: string | null;
  created_at: number;
  updated_at: number;
}

export interface ChatMessageRow {
  id: string;
  thread_id: string;
  role: string;
  parts: string; // JSON
  metadata: string | null; // JSON
  seq: number;
  created_at: number;
}

export const chatThreads = (db: DB) => ({
  upsert(t: { id: string; title?: string | null; created_at?: number; updated_at?: number }): void {
    const now = Date.now();
    db.run(
      `INSERT INTO chat_thread (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = COALESCE(excluded.title, chat_thread.title),
         updated_at = excluded.updated_at`,
      [t.id, t.title ?? null, t.created_at ?? now, t.updated_at ?? now],
    );
  },
  get(id: string): ChatThreadRow | null {
    return db.query<ChatThreadRow, [string]>("SELECT * FROM chat_thread WHERE id = ?").get(id) ?? null;
  },
  list(limit = 50): ChatThreadRow[] {
    return db
      .query<ChatThreadRow, [number]>("SELECT * FROM chat_thread ORDER BY updated_at DESC LIMIT ?")
      .all(limit);
  },
  delete(id: string): void {
    db.run("DELETE FROM chat_thread WHERE id = ?", [id]);
  },
});

export const chatMessages = (db: DB) => ({
  /** Replace the whole thread's messages in one transaction (idempotent save). */
  replaceAll(
    threadId: string,
    msgs: { id: string; role: string; parts: string; metadata?: string | null; created_at?: number }[],
  ): void {
    db.transaction(() => {
      db.run("DELETE FROM chat_message WHERE thread_id = ?", [threadId]);
      let seq = 0;
      for (const m of msgs) {
        db.run(
          `INSERT INTO chat_message (id, thread_id, role, parts, metadata, seq, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [m.id, threadId, m.role, m.parts, m.metadata ?? null, seq, m.created_at ?? Date.now()],
        );
        seq += 1;
      }
    })();
  },
  forThread(threadId: string): ChatMessageRow[] {
    return db
      .query<ChatMessageRow, [string]>(
        "SELECT * FROM chat_message WHERE thread_id = ? ORDER BY seq",
      )
      .all(threadId);
  },
});
