import { Hono } from "hono";
import { z } from "zod";
import { Component, Recipe } from "@backbar/core";
import { components as componentsRepo, recipes as recipesRepo } from "@backbar/db";
import type { Deps } from "../deps";
import { err, parseBody } from "../errors";

const RecipePatch = Recipe.partial();
// Confirm accepts the (possibly operator-edited) draft plus any homemade
// components it references — new ones are created on confirm; ones that already
// exist (by id) are left as-is so the build line just links to them.
const RecipeConfirm = Recipe.partial({ id: true }).extend({
  components: z.array(Component).optional(),
});

export function recipesRouter(deps: Deps) {
  const r = new Hono();

  r.get("/", (c) => {
    const published = c.req.query("published");
    const list = recipesRepo(deps.db).list();
    if (published == null) return c.json(list);
    const want = published === "true" || published === "1";
    return c.json(list.filter((r) => r.is_published === want));
  });

  r.post("/", async (c) => {
    const parsed = await parseBody(c, Recipe);
    if (parsed.error) return parsed.response;
    if (recipesRepo(deps.db).get(parsed.data.id)) {
      return err(c, 409, "duplicate", `recipe '${parsed.data.id}' already exists`);
    }
    const created = recipesRepo(deps.db).insert(parsed.data);
    const { changed } = deps.makeable.recompute();
    for (const ch of changed) deps.bus.emit({ type: "makeable.changed", ...ch });
    return c.json(created, 201);
  });

  r.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const existing = recipesRepo(deps.db).get(id);
    if (!existing) return err(c, 404, "not-found", `recipe '${id}'`);

    const parsed = await parseBody(c, RecipePatch);
    if (parsed.error) return parsed.response;

    const merged = Recipe.parse({ ...existing, ...parsed.data, id });

    deps.db.transaction(() => {
      deps.db.run(
        `UPDATE recipe SET
           name=?, family=?, method=?, glass=?, ice=?, garnish=?, instructions=?,
           source=?, provenance=?, author=?, origin=?, notes=?, abv_estimate=?, balance=?, is_published=?, tags=?
         WHERE id=?`,
        [
          merged.name,
          merged.family ?? null,
          merged.method ?? null,
          merged.glass ?? null,
          merged.ice ?? null,
          merged.garnish ?? null,
          merged.instructions ?? null,
          merged.source ?? null,
          merged.provenance ?? null,
          merged.author ?? null,
          merged.origin ?? null,
          merged.notes ?? null,
          merged.abv_estimate ?? null,
          merged.balance ? JSON.stringify(merged.balance) : null,
          merged.is_published ? 1 : 0,
          JSON.stringify(merged.tags),
          id,
        ],
      );
      if (parsed.data.ingredients) {
        // Replace ingredient list wholesale — patching individual lines is a
        // future concern; ops always submit the canonical recipe shape.
        deps.db.run(`DELETE FROM recipe_ingredient WHERE recipe_id=?`, [id]);
        for (const ing of merged.ingredients) {
          deps.db.run(
            `INSERT INTO recipe_ingredient
               (recipe_id, ref_type, ref_id, label, amount, unit, note, optional, garnish, sort)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              ing.ref_type,
              ing.ref_id ?? null,
              ing.label ?? null,
              ing.amount ?? null,
              ing.unit ?? null,
              ing.note ?? null,
              ing.optional ? 1 : 0,
              ing.garnish ? 1 : 0,
              ing.sort,
            ],
          );
        }
      }
    })();

    const { changed } = deps.makeable.recompute();
    for (const ch of changed) deps.bus.emit({ type: "makeable.changed", ...ch });
    return c.json(recipesRepo(deps.db).get(id));
  });

  /**
   * Human-confirm a photo-import draft (spec ai-engine.md §6). The body is
   * the draft returned by `POST /recipes/import-photo`, possibly edited by
   * the operator. We force `source:'photo-import'` + keep `provenance` so
   * the audit trail can't be sidestepped — but the operator can re-bind any
   * `freeform` ingredient to a real product before confirming.
   */
  r.post("/:id/confirm", async (c) => {
    const id = c.req.param("id");
    const parsed = await parseBody(c, RecipeConfirm);
    if (parsed.error) return parsed.response;

    if (recipesRepo(deps.db).get(id)) {
      return err(c, 409, "duplicate", `recipe '${id}' already exists`);
    }

    const { components: draftComponents, ...recipeFields } = parsed.data;
    const draft = Recipe.parse({
      ...recipeFields,
      id,
      source: "photo-import",
      provenance: parsed.data.provenance ?? null,
    });
    if (!draft.provenance?.startsWith("photo:")) {
      return err(c, 400, "validation", "missing or invalid photo provenance");
    }

    // Create any referenced homemade components that don't already exist, then
    // the recipe — its `ref_type:"component"` build lines link to them by id.
    for (const comp of draftComponents ?? []) {
      if (!componentsRepo(deps.db).get(comp.id)) componentsRepo(deps.db).insert(comp);
    }
    const created = recipesRepo(deps.db).insert(draft);
    const { changed } = deps.makeable.recompute();
    for (const ch of changed) deps.bus.emit({ type: "makeable.changed", ...ch });
    return c.json(created, 201);
  });

  return r;
}
