-- 0007_feature-flag.sql — operator-toggleable feature flags.
-- Flag keys are defined in code (server-side registry) with sensible
-- defaults. This table only stores overrides: a row exists once an
-- operator has touched the flag from Settings. Missing rows fall back
-- to the registry default, so adding a flag in code doesn't require
-- a backfill migration.

CREATE TABLE feature_flag (
  key         TEXT PRIMARY KEY,
  enabled     INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  updated_at  INTEGER NOT NULL
);
