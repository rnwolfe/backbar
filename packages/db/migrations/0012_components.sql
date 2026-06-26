-- 0012_components.sql — reusable, shared "made ingredients" (orgeats, syrups,
-- infusions) that a recipe references as a single build line. A component has its
-- own ingredient list + prep + yield + shelf life and can serve many recipes.
--
-- Also widens recipe_ingredient's CHECK constraints: ref_type gains 'component'
-- (a build line that points at a made component) and unit gains the cocktail-book
-- set (oz/tsp/tbsp/cup/drop/pinch). SQLite can't ALTER a CHECK, so the table is
-- recreated. Nothing FKs *to* recipe_ingredient, so the recreate is self-contained;
-- the whole migration runs inside the runner's transaction.

-- ── widen recipe_ingredient (new ref_type + unit CHECKs, add `note`) ──────────
CREATE TABLE recipe_ingredient_new (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id  TEXT NOT NULL REFERENCES recipe(id) ON DELETE CASCADE,
  ref_type   TEXT NOT NULL,
  ref_id     TEXT,
  label      TEXT,
  amount     REAL,
  unit       TEXT,
  note       TEXT,
  optional   INTEGER NOT NULL DEFAULT 0,
  garnish    INTEGER NOT NULL DEFAULT 0,
  sort       INTEGER NOT NULL DEFAULT 0,
  CHECK (ref_type IN ('product','category','tag','freeform','component')),
  CHECK (unit IS NULL OR unit IN ('ml','oz','dash','barspoon','tsp','tbsp','cup','drop','pinch','each','leaf','top')),
  CHECK (optional IN (0,1)),
  CHECK (garnish IN (0,1))
);

INSERT INTO recipe_ingredient_new
  (id, recipe_id, ref_type, ref_id, label, amount, unit, optional, garnish, sort)
  SELECT id, recipe_id, ref_type, ref_id, label, amount, unit, optional, garnish, sort
  FROM recipe_ingredient;

DROP TABLE recipe_ingredient;
ALTER TABLE recipe_ingredient_new RENAME TO recipe_ingredient;
CREATE INDEX ix_ri_recipe ON recipe_ingredient(recipe_id);

-- ── component (the reusable made-ingredient) ─────────────────────────────────
CREATE TABLE component (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  kind          TEXT,           -- orgeat | syrup | infusion | cordial | tincture | mix | other
  instructions  TEXT,
  yield_ml      REAL,
  keeps         TEXT,           -- shelf life note, e.g. "2 weeks refrigerated"
  notes         TEXT,
  created_at    INTEGER NOT NULL,
  CHECK (kind IS NULL OR kind IN ('orgeat','syrup','infusion','cordial','tincture','mix','other'))
);

-- A component's own ingredients — usually pantry/freeform items. Mirrors
-- recipe_ingredient (minus the drink-only optional/garnish flags).
CREATE TABLE component_ingredient (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  component_id  TEXT NOT NULL REFERENCES component(id) ON DELETE CASCADE,
  ref_type      TEXT NOT NULL,
  ref_id        TEXT,
  label         TEXT,
  amount        REAL,
  unit          TEXT,
  note          TEXT,
  sort          INTEGER NOT NULL DEFAULT 0,
  CHECK (ref_type IN ('product','category','tag','freeform','component')),
  CHECK (unit IS NULL OR unit IN ('ml','oz','dash','barspoon','tsp','tbsp','cup','drop','pinch','each','leaf','top'))
);
CREATE INDEX ix_ci_component ON component_ingredient(component_id);
