-- 0002_views.sql — `low_stock` and `shopping_list` as views, not tables (§1).
--
-- Low-stock rule (§6): per-product override else < max(15% full, 60 ml = 2 standard pours).
-- The per-product override knob isn't on `product` yet — when added (low_threshold_ml),
-- a follow-up migration will swap MAX(...) for COALESCE(p.low_threshold_ml, MAX(...)).

CREATE VIEW low_stock AS
SELECT b.*
FROM bottle b
WHERE b.status IN ('open','sealed')
  AND b.level_ml < MAX(b.full_ml * 0.15, 60);

-- A product appears on the shopping list iff it has zero bottles currently
-- above the low-stock threshold (nothing in stock, or everything is low).
CREATE VIEW shopping_list AS
SELECT
  p.id        AS product_id,
  p.name      AS name,
  p.category  AS category,
  p.subcategory AS subcategory,
  COUNT(b.id) AS healthy_bottles
FROM product p
LEFT JOIN bottle b
  ON b.product_id = p.id
 AND b.status IN ('open','sealed')
 AND b.level_ml >= MAX(b.full_ml * 0.15, 60)
GROUP BY p.id, p.name, p.category, p.subcategory
HAVING COUNT(b.id) = 0;
