-- 0005_category.sql — category palette (label + hue) for product grouping.
-- Products still store `category` as a free-text slug; this table is a
-- registry that drives the Console palette (hue, sort order, display label)
-- and lets operators manage categories from Settings instead of editing TS.
--
-- Not a FK on product(category) — keeping it loose means unknown categories
-- still render (with a neutral hue) and adding a product with a novel
-- category doesn't require pre-creating the registry row.

CREATE TABLE category (
  id          TEXT PRIMARY KEY,           -- slug: "rum", "amaro", "syrup-simple"
  label       TEXT NOT NULL,              -- "Rum", "Amaro", "Simple Syrup"
  hue         INTEGER NOT NULL,           -- 0–360 HSL hue
  sort_order  INTEGER NOT NULL DEFAULT 0, -- ascending; ties broken by label
  created_at  INTEGER NOT NULL            -- unix ms, for audit
);

CREATE INDEX ix_category_sort ON category(sort_order, label);
