import { Hono } from "hono";
import { z } from "zod";
import { PourBinding } from "@backbar/core";
import { pours as poursRepo, recipes as recipesRepo, bottles as bottlesRepo } from "@backbar/db";
import type { Deps } from "../deps";
import { err, parseBody } from "../errors";
import { isLowStock } from "../lowstock";

const PourRequest = z.object({
  recipe_id: z.string().min(1),
  /** Optional explicit overrides; merged on top of the cached makeable bindings. */
  overrides: z.array(PourBinding).optional(),
});

export function pourRouter(deps: Deps) {
  const r = new Hono();

  r.post("/", async (c) => {
    const parsed = await parseBody(c, PourRequest);
    if (parsed.error) return parsed.response;

    const recipe = recipesRepo(deps.db).get(parsed.data.recipe_id);
    if (!recipe) return err(c, 404, "not-found", `recipe '${parsed.data.recipe_id}'`);

    // Snapshot pre-pour low-stock state per touched bottle so we can fire
    // `lowstock.crossed` after the pour without double-firing on a bottle
    // that was already low.
    const item = deps.makeable.list().find((m) => m.recipe_id === parsed.data.recipe_id);
    if (!item || item.state !== "makeable") {
      return err(c, 409, "not-makeable", item ? item.missing : "no makeable evaluation");
    }

    // Merge overrides on top of cached bindings (overrides win per ref).
    const merged = new Map<string, { bottle_id: string; ml: number }>();
    for (const b of item.bindings) {
      if (b.ml === 0) continue; // non-depleting bind — skip
      merged.set(b.ref, { bottle_id: b.bottle_id, ml: b.ml });
    }
    for (const o of parsed.data.overrides ?? []) {
      merged.set(o.bottle_id, { bottle_id: o.bottle_id, ml: o.ml });
    }
    const bindings = [...merged.values()];

    const wasLow = new Map<string, boolean>();
    for (const b of bindings) {
      const row = bottlesRepo(deps.db).get(b.bottle_id);
      if (!row) return err(c, 404, "not-found", `bottle '${b.bottle_id}'`);
      wasLow.set(b.bottle_id, isLowStock(row));
    }

    let result;
    try {
      result = poursRepo(deps.db).apply({
        recipe_id: parsed.data.recipe_id,
        bindings,
      });
    } catch (e) {
      return err(c, 422, "pour-failed", e instanceof Error ? e.message : String(e));
    }

    // Emit reading.updated per depletion, lowstock.crossed on transitions.
    for (const d of result.depletions) {
      if (d.ml === 0) continue;
      deps.bus.emit({
        type: "reading.updated",
        bottle_id: d.bottle_id,
        level_ml: d.new_ml,
        source: "pour",
        ts: result.pour.made_at,
      });
      const bottleAfter = bottlesRepo(deps.db).get(d.bottle_id);
      if (bottleAfter && isLowStock(bottleAfter) && !wasLow.get(d.bottle_id)) {
        deps.bus.emit({ type: "lowstock.crossed", bottle_id: d.bottle_id, level_ml: d.new_ml });
      }
    }

    const { changed } = deps.makeable.recompute();
    for (const ch of changed) deps.bus.emit({ type: "makeable.changed", ...ch });

    return c.json(result.pour);
  });

  return r;
}
