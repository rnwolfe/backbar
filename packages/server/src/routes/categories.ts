/**
 * /categories — palette registry for the Console (label + hue + sort).
 *
 * Operators manage the list from Settings; products store `category` as a
 * free-text slug, so deleting an in-use category is refused (409) rather
 * than orphaning rows. Unknown categories still render — they just fall
 * back to a neutral hue client-side.
 */
import { Hono } from "hono";
import { z } from "zod";
import { Category } from "@backbar/core";
import { categories as categoriesRepo } from "@backbar/db";
import type { Deps } from "../deps";
import { err, parseBody } from "../errors";

const CategoryCreate = Category.omit({ created_at: true });
const CategoryPatch = Category.pick({ label: true, hue: true, sort_order: true }).partial();

export function categoriesRouter(deps: Deps) {
  const r = new Hono();

  r.get("/", (c) => {
    return c.json(categoriesRepo(deps.db).list());
  });

  r.post("/", async (c) => {
    const parsed = await parseBody(c, CategoryCreate);
    if (parsed.error) return parsed.response;
    if (categoriesRepo(deps.db).get(parsed.data.id)) {
      return err(c, 409, "duplicate", `category '${parsed.data.id}' already exists`);
    }
    const created = categoriesRepo(deps.db).insert(parsed.data);
    return c.json(created, 201);
  });

  r.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const parsed = await parseBody(c, CategoryPatch);
    if (parsed.error) return parsed.response;
    const updated = categoriesRepo(deps.db).update(id, parsed.data);
    if (!updated) return err(c, 404, "not-found", `category '${id}'`);
    return c.json(updated);
  });

  r.delete("/:id", (c) => {
    const id = c.req.param("id");
    if (!categoriesRepo(deps.db).get(id)) {
      return err(c, 404, "not-found", `category '${id}'`);
    }
    const inUse = categoriesRepo(deps.db).productCount(id);
    if (inUse > 0) {
      return err(
        c,
        409,
        "in-use",
        `category '${id}' is used by ${inUse} product${inUse === 1 ? "" : "s"} — reassign first`,
      );
    }
    categoriesRepo(deps.db).delete(id);
    return c.body(null, 204);
  });

  return r;
}
