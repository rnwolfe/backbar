# specs/data-model.md

Detail for `packages/core` (pure types, zod, makeability, math) and `packages/db` (bun:sqlite). Authoritative parent: `backbar-architecture-spec.md` §1, §2, §6. If anything here conflicts with the parent spec, the parent wins.

**Principles:** `core` is pure/IO-free. Zod schemas are the single source of truth — TS types are `z.infer`. `reading` is append-only; `bottle.level_ml` is a derived cache. Catalog ids = slug; event ids = UUIDv7.

---

## 1. Migration — `packages/db/migrations/0001_init.sql`

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE product (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL,
  subcategory   TEXT,
  abv           REAL,                       -- 0..1
  density_g_ml  REAL,                        -- null => category default (§units)
  default_ml    INTEGER,
  flavor_tags   TEXT NOT NULL DEFAULT '[]',  -- json string[]
  notes         TEXT
);

CREATE TABLE bottle (
  id           TEXT PRIMARY KEY,            -- uuidv7
  product_id   TEXT NOT NULL REFERENCES product(id) ON DELETE RESTRICT,
  slot         TEXT,                         -- null = untracked
  tare_g       REAL,
  full_ml      INTEGER NOT NULL,
  level_ml     REAL NOT NULL,                -- DERIVED cache of latest reading
  status       TEXT NOT NULL DEFAULT 'open', -- sealed|open|empty|archived
  tracked      INTEGER NOT NULL DEFAULT 0,   -- 1 = weight-tracked
  opened_at    INTEGER, purchased_at INTEGER, price_cents INTEGER
);
CREATE INDEX ix_bottle_product ON bottle(product_id);
CREATE INDEX ix_bottle_status  ON bottle(status);

CREATE TABLE reading (                        -- APPEND ONLY
  id          TEXT PRIMARY KEY,              -- uuidv7
  bottle_id   TEXT NOT NULL REFERENCES bottle(id) ON DELETE CASCADE,
  level_ml    REAL NOT NULL,
  source      TEXT NOT NULL,                 -- manual|weight|pour
  confidence  REAL NOT NULL DEFAULT 1,
  raw         TEXT,                           -- json
  ts          INTEGER NOT NULL
);
CREATE INDEX ix_reading_bottle_ts ON reading(bottle_id, ts DESC);

CREATE TABLE recipe (
  id           TEXT PRIMARY KEY,             -- slug
  name         TEXT NOT NULL,
  family       TEXT, method TEXT, glass TEXT, ice TEXT, garnish TEXT,
  instructions TEXT,
  source       TEXT,                          -- book|me|ai|photo-import
  provenance   TEXT,
  abv_estimate REAL,
  balance      TEXT,                          -- json {sweet,sour,bitter,strong,aromatic,dilution}
  is_published INTEGER NOT NULL DEFAULT 0,
  tags         TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE recipe_ingredient (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id  TEXT NOT NULL REFERENCES recipe(id) ON DELETE CASCADE,
  ref_type   TEXT NOT NULL,                  -- product|category|tag|freeform
  ref_id     TEXT,
  label      TEXT,
  amount     REAL, unit TEXT,                -- ml|dash|barspoon|each|leaf|top
  optional   INTEGER NOT NULL DEFAULT 0,
  garnish    INTEGER NOT NULL DEFAULT 0,
  sort       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX ix_ri_recipe ON recipe_ingredient(recipe_id);

CREATE TABLE pour (
  id           TEXT PRIMARY KEY,             -- uuidv7
  recipe_id    TEXT REFERENCES recipe(id) ON DELETE SET NULL,
  made_at      INTEGER NOT NULL,
  bottles_used TEXT NOT NULL                  -- json [{bottle_id, ml}]
);

CREATE TABLE sensor_channel (
  device_id  TEXT NOT NULL,
  channel    INTEGER NOT NULL,
  slot       TEXT NOT NULL,
  bottle_id  TEXT REFERENCES bottle(id) ON DELETE SET NULL,
  cal_slope  REAL, cal_offset REAL,
  PRIMARY KEY (device_id, channel)
);

CREATE TABLE node (                            -- fleet health from MQTT birth/LWT
  device_id  TEXT PRIMARY KEY,
  label      TEXT, last_seen INTEGER,
  status     TEXT NOT NULL DEFAULT 'offline',  -- online|offline
  fw_version TEXT
);
```

Migrations run in order from `migrations/`; track applied versions in a `_migrations(version, applied_at)` table.

---

## 2. Zod schemas — `packages/core/src/schema.ts`

```ts
import { z } from "zod";

export const Source     = z.enum(["manual", "weight", "pour"]);
export const Status     = z.enum(["sealed", "open", "empty", "archived"]);
export const RefType    = z.enum(["product", "category", "tag", "freeform"]);
export const Unit       = z.enum(["ml", "dash", "barspoon", "each", "leaf", "top"]);
export const Method     = z.enum(["build", "stir", "shake", "swizzle", "blend", "throw"]);

export const Product = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/), name: z.string().min(1),
  category: z.string().min(1), subcategory: z.string().nullish(),
  abv: z.number().min(0).max(1).nullish(),
  density_g_ml: z.number().positive().nullish(),
  default_ml: z.number().int().positive().nullish(),
  flavor_tags: z.array(z.string()).default([]), notes: z.string().nullish(),
});

export const Bottle = z.object({
  id: z.string(), product_id: z.string(), slot: z.string().nullish(),
  tare_g: z.number().nullish(), full_ml: z.number().int().positive(),
  level_ml: z.number().min(0), status: Status.default("open"),
  tracked: z.coerce.boolean().default(false),
  opened_at: z.number().nullish(), purchased_at: z.number().nullish(), price_cents: z.number().int().nullish(),
});

export const Reading = z.object({
  id: z.string(), bottle_id: z.string(), level_ml: z.number().min(0),
  source: Source, confidence: z.number().min(0).max(1).default(1),
  raw: z.record(z.unknown()).nullish(), ts: z.number().int(),
});

export const Balance = z.object({
  sweet: z.number().min(0).max(1), sour: z.number().min(0).max(1),
  bitter: z.number().min(0).max(1), strong: z.number().min(0).max(1),
  aromatic: z.number().min(0).max(1), dilution: z.number().min(0).max(1),
});

export const RecipeIngredient = z.object({
  ref_type: RefType, ref_id: z.string().nullish(), label: z.string().nullish(),
  amount: z.number().positive().nullish(), unit: Unit.nullish(),
  optional: z.coerce.boolean().default(false), garnish: z.coerce.boolean().default(false),
});

export const Recipe = z.object({
  id: z.string(), name: z.string().min(1),
  family: z.string().nullish(), method: Method.nullish(),
  glass: z.string().nullish(), ice: z.string().nullish(), garnish: z.string().nullish(),
  instructions: z.string().nullish(),
  source: z.enum(["book", "me", "ai", "photo-import"]).nullish(), provenance: z.string().nullish(),
  abv_estimate: z.number().nullish(), balance: Balance.nullish(),
  is_published: z.coerce.boolean().default(false), tags: z.array(z.string()).default([]),
  ingredients: z.array(RecipeIngredient).default([]),
});

// ingest payloads (API + MQTT both parse these before applyReading)
export const ManualReading = z.object({ bottle_id: z.string(), level_ml: z.number().min(0) });
export const WeightReading = z.object({ device_id: z.string(), channel: z.number().int(), raw_g: z.number(), ts: z.number().int() });

export type Product = z.infer<typeof Product>;
export type Bottle = z.infer<typeof Bottle>;
export type Reading = z.infer<typeof Reading>;
export type Recipe = z.infer<typeof Recipe>;
export type Balance = z.infer<typeof Balance>;
```

---

## 3. Units & density — `packages/core/src/units.ts`

```ts
export const UNIT_ML: Record<string, number> = { ml: 1, dash: 0.9, barspoon: 5, top: 60 };
export const NON_DEPLETING = new Set(["each", "leaf"]);     // counted, not volume

export function toMl(amount: number, unit: string): number {
  if (NON_DEPLETING.has(unit)) return 0;                    // doesn't draw from a bottle
  return amount * (UNIT_ML[unit] ?? 1);
}

export const DENSITY_BY_CATEGORY: Record<string, number> = {
  spirit: 0.95, "spirit-high": 0.93, vermouth: 1.0, wine: 1.0,
  amaro: 1.08, liqueur: 1.08, "syrup-simple": 1.22, "syrup-rich": 1.30,
  citrus: 1.03, juice: 1.04, bitters: 0.95, water: 1.0,
};
export function density(p: { density_g_ml?: number | null; category: string; abv?: number | null }): number {
  if (p.density_g_ml) return p.density_g_ml;
  if (p.category === "spirit" && (p.abv ?? 0) >= 0.5) return DENSITY_BY_CATEGORY["spirit-high"];
  return DENSITY_BY_CATEGORY[p.category] ?? 0.96;
}
export const gramsToMl = (netG: number, d: number) => netG / d;   // (gross - tare)/density
```

---

## 4. Makeability — `packages/core/src/makeability.ts`

Pure. `inventory` = in-stock bottles joined to their product. Resolution per `ref_type`; satisfiable if ≥1 candidate bottle has `level_ml ≥ need`. Binding prefers the *most-depleted* valid bottle (use-it-up; configurable).

```ts
import { toMl, NON_DEPLETING } from "./units";
import type { Product, Bottle, Recipe } from "./schema";

export type InvBottle = Bottle & { product: Product };
export type Binding = { ref: string; bottle_id: string; ml: number };
export type Result = {
  recipe_id: string;
  state: "makeable" | "one-away" | "unmakeable";
  missing: string[];          // ingredient labels not satisfiable
  bindings: Binding[];        // for makeable: which bottle pours each line
};

const FREEFORM_OK = new Set(["egg-white", "egg", "soda", "water", "ice", "mint", "salt"]);

function candidates(ing: Recipe["ingredients"][number], inv: InvBottle[]): InvBottle[] {
  switch (ing.ref_type) {
    case "product":  return inv.filter(b => b.product_id === ing.ref_id);
    case "category": return inv.filter(b => b.product.category === ing.ref_id);
    case "tag":      return inv.filter(b => b.product.flavor_tags.includes(ing.ref_id ?? ""));
    case "freeform": return [];
  }
}

export function evaluate(
  recipe: Recipe, inv: InvBottle[],
  opts: { policy?: "use-it-up" | "freshest" } = {},
): Result {
  const policy = opts.policy ?? "use-it-up";
  const missing: string[] = []; const bindings: Binding[] = [];

  for (const ing of recipe.ingredients) {
    if (ing.optional || ing.garnish) continue;
    if (ing.ref_type === "freeform") {
      if (!FREEFORM_OK.has(ing.ref_id ?? "")) missing.push(ing.label ?? ing.ref_id ?? "?");
      continue;
    }
    const need = ing.unit && NON_DEPLETING.has(ing.unit) ? 0 : toMl(ing.amount ?? 0, ing.unit ?? "ml");
    const ok = candidates(ing, inv)
      .filter(b => b.status === "open" || b.status === "sealed")
      .filter(b => b.level_ml >= need);
    if (ok.length === 0) { missing.push(ing.label ?? ing.ref_id ?? "?"); continue; }
    ok.sort((a, b) => policy === "use-it-up" ? a.level_ml - b.level_ml : b.level_ml - a.level_ml);
    bindings.push({ ref: ing.ref_id ?? ing.label ?? "?", bottle_id: ok[0].id, ml: need });
  }

  const state = missing.length === 0 ? "makeable" : missing.length === 1 ? "one-away" : "unmakeable";
  return { recipe_id: recipe.id, state, missing, bindings };
}

// shopping muse: greedy coverage over un-owned candidate products
export function coverage(
  oneAway: Result[], recipes: Map<string, Recipe>, inv: InvBottle[],
): { product: string; unlocks: string[] }[] {
  const owned = new Set(inv.map(b => b.product_id));
  const score = new Map<string, string[]>();
  for (const r of oneAway) {
    const rec = recipes.get(r.recipe_id); if (!rec) continue;
    const miss = rec.ingredients.find(i => !i.optional && !i.garnish &&
      i.ref_type === "product" && !owned.has(i.ref_id ?? ""));
    if (miss?.ref_id) (score.get(miss.ref_id) ?? score.set(miss.ref_id, []).get(miss.ref_id)!)
      .push(rec.name);
  }
  return [...score].map(([product, unlocks]) => ({ product, unlocks }))
    .sort((a, b) => b.unlocks.length - a.unlocks.length);
}
```

Unit tests (write first): satisfiable/unsatisfiable per `ref_type`; one-away boundary (exactly one missing); dash/barspoon/top conversion; non-depleting units never block; use-it-up binding picks the lowest valid bottle; coverage ranks correctly.

---

## 5. Repositories & ingest core — `packages/db`

Repos are thin; JSON columns parse through Zod on read. Key derived queries:

```ts
// latest reading per bottle (the canonical level)
const LATEST = `SELECT r.* FROM reading r JOIN (
  SELECT bottle_id, MAX(ts) ts FROM reading GROUP BY bottle_id
) m ON m.bottle_id=r.bottle_id AND m.ts=r.ts`;

// low stock (threshold: per-product override else max(15% full, 2*standard pour=60ml))
const LOW = `SELECT * FROM bottle WHERE status IN('open','sealed')
  AND level_ml < MAX(full_ml*0.15, 60)`;

// rebuild the level_ml cache from the log (recovery / migration)
const REBUILD = `UPDATE bottle SET level_ml=(
  SELECT level_ml FROM reading WHERE bottle_id=bottle.id ORDER BY ts DESC LIMIT 1)`;
```

**`applyReading()` — the one ingest core** (MQTT subscriber + HTTP `/ingest` both call this):

```ts
// 1. write append-only reading (uuidv7, ts)
// 2. UPDATE bottle.level_ml = reading.level_ml; flip status->empty if ~0
// 3. recompute makeability for recipes touching this bottle's product
// 4. evaluate low-stock; if newly crossed -> enqueue webhook
// 5. broadcast WS: reading.updated + any makeable.changed
```

**Pour path** (`POST /pour`): given a recipe's `bindings`, for each `{bottle_id, ml}` emit a `reading{ source:'pour', level_ml: prev-ml }` via `applyReading`, then insert the `pour` row. This is the zero-hardware depletion path and reuses the exact same core.

---

## 6. Seed — `packages/db/seed/canon.ts`

Layer-1 classics only (Old Fashioned, Negroni, Martini, Manhattan, Daiquiri, Margarita, Whiskey Sour, Jungle Bird, Mai Tai, …) as `{recipe, ingredients[]}` literals — proportions + method as facts. Ingredients use `ref_type:'category'` where substitutable (`"any London Dry gin"`), `'product'` only when specificity matters. **No book prose.** Owned-book recipes enter via photo-import (see `ai-engine.md`).

---

## Invariants (enforced in tests + review)
- `reading` rows are never updated or deleted (except GDPR-style bottle cascade).
- `bottle.level_ml` always equals the latest reading; rebuildable via `REBUILD`.
- Every write path parses through Zod first.
- `core` imports nothing from `db`/`server` (pure).
