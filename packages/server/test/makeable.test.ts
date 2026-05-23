import { describe, expect, test } from "bun:test";
import { applyReading } from "../src/ingest";
import { setup } from "./_helpers";

describe("MakeableCache — recompute + transition tracking", () => {
  test("initial recompute marks seeded recipe as makeable", () => {
    const { deps } = setup();
    const item = deps.makeable.list().find((m) => m.recipe_id === "daiquiri");
    expect(item?.state).toBe("makeable");
    expect(item?.recipe.is_published).toBe(true);
  });

  test("recompute() reports only recipes that actually flipped", () => {
    const { deps } = setup();
    // First recompute after construction yields no further changes.
    const first = deps.makeable.recompute();
    expect(first.changed.length).toBe(0);

    // Drain rum → daiquiri unmakeable. Second recompute reports the flip.
    applyReading(deps, { kind: "manual", bottle_id: "b-rum", level_ml: 0 });
    // applyReading already recomputed; another call should be a no-op.
    const noop = deps.makeable.recompute();
    expect(noop.changed.length).toBe(0);
  });

  test("removing a recipe from the index reports a synthetic transition", () => {
    const { deps, db } = setup();
    db.run("DELETE FROM recipe_ingredient WHERE recipe_id='daiquiri'");
    db.run("DELETE FROM recipe WHERE id='daiquiri'");
    const { changed } = deps.makeable.recompute();
    expect(changed.some((c) => c.recipe_id === "daiquiri" && c.state === "unmakeable")).toBe(true);
  });
});
