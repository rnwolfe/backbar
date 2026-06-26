import { Hono } from "hono";
import { z } from "zod";
import { Component } from "@backbar/core";
import { components as componentsRepo, recipes as recipesRepo } from "@backbar/db";
import type { Deps } from "../deps";
import { err, parseBody } from "../errors";

const FlagPatch = z.object({
  blocks_makeability: z.boolean().optional(),
  on_hand: z.boolean().optional(),
});

/** A component's makeability flags (or its existence) can flip drink makeability —
 *  recompute + broadcast like recipe/bottle writes do. */
function recomputeMakeable(deps: Deps) {
  const { changed } = deps.makeable.recompute();
  for (const ch of changed) deps.bus.emit({ type: "makeable.changed", ...ch });
}

/**
 * /components — reusable made-ingredients (orgeats, syrups, infusions) that
 * recipes reference via a `ref_type:"component"` build line. CRUD only; the
 * recipe ↔ component link lives in `recipe_ingredient` (ref_id = component id).
 */
export function componentsRouter(deps: Deps) {
  const r = new Hono();

  r.get("/", (c) => c.json(componentsRepo(deps.db).list()));

  r.get("/:id", (c) => {
    const comp = componentsRepo(deps.db).get(c.req.param("id"));
    if (!comp) return err(c, 404, "not-found", `component '${c.req.param("id")}'`);
    // Which recipes use this component? Cheap join — handy for the detail view
    // and to warn before delete.
    const usedBy = recipesRepo(deps.db)
      .list()
      .filter((rec) => rec.ingredients.some((i) => i.ref_type === "component" && i.ref_id === comp.id))
      .map((rec) => ({ id: rec.id, name: rec.name }));
    return c.json({ ...comp, used_by: usedBy });
  });

  r.post("/", async (c) => {
    const parsed = await parseBody(c, Component);
    if (parsed.error) return parsed.response;
    if (componentsRepo(deps.db).get(parsed.data.id)) {
      return err(c, 409, "duplicate", `component '${parsed.data.id}' already exists`);
    }
    const created = componentsRepo(deps.db).insert(parsed.data);
    recomputeMakeable(deps);
    return c.json(created, 201);
  });

  r.put("/:id", async (c) => {
    const id = c.req.param("id");
    if (!componentsRepo(deps.db).get(id)) return err(c, 404, "not-found", `component '${id}'`);
    const parsed = await parseBody(c, Component);
    if (parsed.error) return parsed.response;
    // Path id wins — body id is advisory.
    const updated = componentsRepo(deps.db).update({ ...parsed.data, id });
    recomputeMakeable(deps);
    return c.json(updated);
  });

  /**
   * PATCH /components/:id — toggle makeability flags without resending the whole
   * component. Used by the "on hand" / "blocks" toggles in the Prep view.
   */
  r.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const existing = componentsRepo(deps.db).get(id);
    if (!existing) return err(c, 404, "not-found", `component '${id}'`);
    const parsed = await parseBody(c, FlagPatch);
    if (parsed.error) return parsed.response;
    componentsRepo(deps.db).setFlags(id, parsed.data);
    recomputeMakeable(deps);
    return c.json(componentsRepo(deps.db).get(id));
  });

  r.delete("/:id", (c) => {
    const id = c.req.param("id");
    const recipesUsing = recipesRepo(deps.db)
      .list()
      .filter((rec) => rec.ingredients.some((i) => i.ref_type === "component" && i.ref_id === id))
      .map((rec) => rec.name);
    if (recipesUsing.length > 0) {
      // Don't orphan recipe build lines silently — make the operator unlink first.
      return err(c, 409, "in-use", `component '${id}' is used by: ${recipesUsing.join(", ")}`);
    }
    if (!componentsRepo(deps.db).remove(id)) return err(c, 404, "not-found", `component '${id}'`);
    recomputeMakeable(deps);
    return c.json({ ok: true, id });
  });

  return r;
}
