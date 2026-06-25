-- 0011_app-setting.sql — generic operator settings (key/value).
-- For single-value operator config that isn't a boolean (those are feature_flag)
-- and isn't its own first-class table. Known keys + validation live in the
-- server-side settings registry; this table only stores set values. First use:
-- `va_abc.home_store` — the operator's nearest Virginia ABC store number, anchor
-- for the local-stock lookup (was an env var; now operator-editable in Settings).

CREATE TABLE app_setting (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);
