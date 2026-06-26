-- 0013_component-makeability.sql — let a component optionally gate makeability.
--
-- `blocks_makeability` opts a component IN to gating (default off — a simple
-- syrup you can whip up on demand shouldn't block a drink). When it blocks, the
-- referencing recipe is only makeable if `on_hand` is set (you've prepped a
-- batch). Trivial preps stay non-blocking; specialty ones (needing an unusual
-- ingredient) can require being on hand. Existing components keep today's
-- behavior (non-blocking) via the 0 defaults.

ALTER TABLE component ADD COLUMN blocks_makeability INTEGER NOT NULL DEFAULT 0 CHECK (blocks_makeability IN (0,1));
ALTER TABLE component ADD COLUMN on_hand            INTEGER NOT NULL DEFAULT 0 CHECK (on_hand IN (0,1));
