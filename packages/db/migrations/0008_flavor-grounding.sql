-- Flavor-grounding corpus tables (specs/ai-grounding-corpus.md).
-- Backs the AI mixology tool registry: per-ingredient flavor profiles, pairing
-- edges (co-occurrence + molecular), substitutions, and Cocktail-Codex roots.

CREATE TABLE IF NOT EXISTS flavor_profile (
  ref         TEXT PRIMARY KEY,
  ref_type    TEXT NOT NULL,
  descriptors TEXT NOT NULL,            -- JSON string[]
  axes        TEXT NOT NULL,            -- JSON { sweet, sour, bitter, strong, aromatic }
  typical_abv REAL NOT NULL,
  intensity   REAL NOT NULL,
  role        TEXT NOT NULL,
  notes       TEXT
);

-- Undirected pairing edges, stored canonically with a <= b. Either signal may
-- be NULL (co-occurrence from our recipe corpus; molecular from the Ahn build).
CREATE TABLE IF NOT EXISTS flavor_pairing (
  a            TEXT NOT NULL,
  b            TEXT NOT NULL,
  cooccurrence REAL,
  molecular    REAL,
  PRIMARY KEY (a, b)
);
CREATE INDEX IF NOT EXISTS idx_flavor_pairing_b ON flavor_pairing(b);

CREATE TABLE IF NOT EXISTS ingredient_substitute (
  ref            TEXT NOT NULL,
  substitute_ref TEXT NOT NULL,
  note           TEXT,
  PRIMARY KEY (ref, substitute_ref)
);

CREATE TABLE IF NOT EXISTS root_template (
  root     TEXT PRIMARY KEY,
  family   TEXT NOT NULL,
  skeleton TEXT NOT NULL,
  method   TEXT NOT NULL,
  ratio    TEXT NOT NULL,                -- JSON number[]
  roles    TEXT NOT NULL,                -- JSON string[]
  derived  TEXT NOT NULL                 -- JSON string[]
);
