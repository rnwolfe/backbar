-- 0001_init.sql — Backbar baseline schema (specs/data-model.md §1).
-- Catalog ids = slug, event ids = UUIDv7. `reading` is APPEND ONLY.
-- `bottle.level_ml` is a derived cache, rebuildable by replaying readings.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE product (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL,
  subcategory   TEXT,
  abv           REAL,
  density_g_ml  REAL,
  default_ml    INTEGER,
  flavor_tags   TEXT NOT NULL DEFAULT '[]',
  notes         TEXT
);

CREATE TABLE bottle (
  id            TEXT PRIMARY KEY,
  product_id    TEXT NOT NULL REFERENCES product(id) ON DELETE RESTRICT,
  slot          TEXT,
  tare_g        REAL,
  full_ml       INTEGER NOT NULL,
  level_ml      REAL NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open',
  tracked       INTEGER NOT NULL DEFAULT 0,
  opened_at     INTEGER,
  purchased_at  INTEGER,
  price_cents   INTEGER,
  CHECK (status IN ('sealed','open','empty','archived')),
  CHECK (tracked IN (0,1))
);
CREATE INDEX ix_bottle_product ON bottle(product_id);
CREATE INDEX ix_bottle_status  ON bottle(status);

CREATE TABLE reading (
  id          TEXT PRIMARY KEY,
  bottle_id   TEXT NOT NULL REFERENCES bottle(id) ON DELETE CASCADE,
  level_ml    REAL NOT NULL,
  source      TEXT NOT NULL,
  confidence  REAL NOT NULL DEFAULT 1,
  raw         TEXT,
  ts          INTEGER NOT NULL,
  CHECK (source IN ('manual','weight','pour'))
);
CREATE INDEX ix_reading_bottle_ts ON reading(bottle_id, ts DESC);

-- Guard the append-only invariant — UPDATE / DELETE on `reading` is forbidden
-- except via ON DELETE CASCADE from bottle (which is row-level cascade, not
-- a direct DELETE statement on `reading`).
CREATE TRIGGER reading_no_update BEFORE UPDATE ON reading
BEGIN
  SELECT RAISE(ABORT, 'reading is append-only');
END;

CREATE TABLE recipe (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  family        TEXT,
  method        TEXT,
  glass         TEXT,
  ice           TEXT,
  garnish       TEXT,
  instructions  TEXT,
  source        TEXT,
  provenance    TEXT,
  abv_estimate  REAL,
  balance       TEXT,
  is_published  INTEGER NOT NULL DEFAULT 0,
  tags          TEXT NOT NULL DEFAULT '[]',
  CHECK (is_published IN (0,1)),
  CHECK (method IS NULL OR method IN ('build','stir','shake','swizzle','blend','throw')),
  CHECK (source IS NULL OR source IN ('book','me','ai','photo-import'))
);

CREATE TABLE recipe_ingredient (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id  TEXT NOT NULL REFERENCES recipe(id) ON DELETE CASCADE,
  ref_type   TEXT NOT NULL,
  ref_id     TEXT,
  label      TEXT,
  amount     REAL,
  unit       TEXT,
  optional   INTEGER NOT NULL DEFAULT 0,
  garnish    INTEGER NOT NULL DEFAULT 0,
  sort       INTEGER NOT NULL DEFAULT 0,
  CHECK (ref_type IN ('product','category','tag','freeform')),
  CHECK (unit IS NULL OR unit IN ('ml','dash','barspoon','each','leaf','top')),
  CHECK (optional IN (0,1)),
  CHECK (garnish IN (0,1))
);
CREATE INDEX ix_ri_recipe ON recipe_ingredient(recipe_id);

CREATE TABLE pour (
  id            TEXT PRIMARY KEY,
  recipe_id     TEXT REFERENCES recipe(id) ON DELETE SET NULL,
  made_at       INTEGER NOT NULL,
  bottles_used  TEXT NOT NULL
);
CREATE INDEX ix_pour_made_at ON pour(made_at DESC);

CREATE TABLE sensor_channel (
  device_id   TEXT NOT NULL,
  channel     INTEGER NOT NULL,
  slot        TEXT NOT NULL,
  bottle_id   TEXT REFERENCES bottle(id) ON DELETE SET NULL,
  cal_slope   REAL,
  cal_offset  REAL,
  PRIMARY KEY (device_id, channel)
);
CREATE INDEX ix_sensor_channel_bottle ON sensor_channel(bottle_id);

CREATE TABLE node (
  device_id   TEXT PRIMARY KEY,
  label       TEXT,
  last_seen   INTEGER,
  status      TEXT NOT NULL DEFAULT 'offline',
  fw_version  TEXT,
  CHECK (status IN ('online','offline'))
);
