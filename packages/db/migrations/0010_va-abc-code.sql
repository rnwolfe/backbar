-- 0010_va-abc-code.sql — pin a product to its Virginia ABC catalog SKU so the
-- procurement integration (packages/server/src/integrations/va-abc) can look up
-- local stock deterministically instead of re-searching by name every time.
--
-- 6-digit zero-padded product code (the value the /webapi/inventory/* endpoints
-- expect). Nullable: most products have no code until first resolved, and the
-- whole feature is optional/deferred. The integration auto-resolves via Coveo
-- search when this is null and persists the best match; the operator can correct
-- a wrong match via PATCH /products/:id.

ALTER TABLE product ADD COLUMN va_abc_code TEXT;  -- e.g. "042395" (Planteray Original Dark)

CREATE INDEX IF NOT EXISTS ix_product_va_abc_code ON product(va_abc_code);
