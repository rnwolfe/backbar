-- 0003_product_metadata.sql — first-class structured columns on product per
-- specs/inventory-model.md §3a. All nullable, no defaults change so existing
-- rows survive the migration intact.

ALTER TABLE product ADD COLUMN distillery        TEXT;        -- "Foursquare", "Buffalo Trace Distillery"
ALTER TABLE product ADD COLUMN origin_country    TEXT;        -- ISO-3166-1 alpha-2: "US", "BB", "MX"
ALTER TABLE product ADD COLUMN origin_region     TEXT;        -- "Kentucky", "Barbados", "Oaxaca"
ALTER TABLE product ADD COLUMN producer_url      TEXT;        -- canonical link, optional
ALTER TABLE product ADD COLUMN age_statement_y   REAL;        -- 12 for 12-year; null when NAS

CREATE INDEX IF NOT EXISTS ix_product_distillery     ON product(distillery);
CREATE INDEX IF NOT EXISTS ix_product_origin_country ON product(origin_country);
