-- 0006_fix-canon-categories.sql — one-shot data fix for canon products that
-- shipped with category="spirit" while their real category (rum / tequila /
-- absinthe) was demoted to `subcategory`. Surface effect: those products
-- showed up under "Spirits" in the Bottles + Catalog group rails.
--
-- Idempotent by design: each UPDATE includes `AND category = 'spirit'`, so
-- if an operator already corrected the rows by hand the statement is a no-op.

UPDATE product SET category = 'rum',      subcategory = 'white'    WHERE id = 'bacardi-superior'        AND category = 'spirit';
UPDATE product SET category = 'rum',      subcategory = 'aged'     WHERE id = 'appleton-estate-reserve' AND category = 'spirit';
UPDATE product SET category = 'rum',      subcategory = 'jamaican' WHERE id = 'smith-and-cross'         AND category = 'spirit';
UPDATE product SET category = 'rum',      subcategory = 'blackstrap' WHERE id = 'cruzan-blackstrap'     AND category = 'spirit';
UPDATE product SET category = 'tequila',  subcategory = 'blanco'   WHERE id = 'espolon-blanco'          AND category = 'spirit';
UPDATE product SET category = 'absinthe', subcategory = 'verte'    WHERE id = 'absinthe'                AND category = 'spirit';
