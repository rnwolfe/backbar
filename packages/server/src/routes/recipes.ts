import { Hono } from "hono";
import { Recipe } from "@backbar/core";
import { recipes as recipesRepo } from "@backbar/db";
import type { Deps } from "../deps";
import { err, parseBody } from "../errors";

const RecipePatch = Recipe.partial();

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
           source=?, provenance=?, abv_estimate=?, balance=?, is_published=?, tags=?
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
               (recipe_id, ref_type, ref_id, label, amount, unit, optional, garnish, sort)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              ing.ref_type,
              ing.ref_id ?? null,
              ing.label ?? null,
              ing.amount ?? null,
              ing.unit ?? null,
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

  return r;
}
