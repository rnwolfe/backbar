-- 0004_product_tag.sql — namespaced product tag table per
-- specs/inventory-model.md §3b. Multiple taxonomies coexist by namespace
-- (smugglers-cove, cocktail-codex, flavor, operator, ...).
--
-- Recipe ingredient refs with ref_type='tag' resolve against this table
-- (in addition to product.flavor_tags for back-compat).

CREATE TABLE product_tag (
  product_id TEXT NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  namespace  TEXT NOT NULL,
  value      TEXT NOT NULL,
  PRIMARY KEY (product_id, namespace, value)
);

CREATE INDEX ix_product_tag_ns_val   ON product_tag(namespace, value);
CREATE INDEX ix_product_tag_product  ON product_tag(product_id);
