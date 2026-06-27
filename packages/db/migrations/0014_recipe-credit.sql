-- 0014_recipe-credit.sql — human credit/provenance on recipes.
-- `provenance` already exists for the machine audit trail (photo:<hash>); these
-- capture the attribution printed with book/menu recipes that import used to drop:
--   author = creator/bartender ("Max Reis")
--   origin = the bar / book / place ("Daisy Margarita Bar, Sherman Oaks, CA")
--   notes  = the headnote / story / context
-- All nullable; existing recipes are unaffected.

ALTER TABLE recipe ADD COLUMN author TEXT;
ALTER TABLE recipe ADD COLUMN origin TEXT;
ALTER TABLE recipe ADD COLUMN notes  TEXT;
