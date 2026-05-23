import { Hono } from "hono";
import { Product } from "@backbar/core";
import { products as productsRepo } from "@backbar/db";
import type { Deps } from "../deps";
import { err, parseBody } from "../errors";

export function productsRouter(deps: Deps) {
  const r = new Hono();

  r.get("/", (c) => c.json(productsRepo(deps.db).list()));

  r.post("/", async (c) => {
    const parsed = await parseBody(c, Product);
    if (parsed.error) return parsed.response;
    if (productsRepo(deps.db).get(parsed.data.id)) {
      return err(c, 409, "duplicate", `product '${parsed.data.id}' already exists`);
    }
    const created = productsRepo(deps.db).insert(parsed.data);
    return c.json(created, 201);
  });

  r.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const existing = productsRepo(deps.db).get(id);
    if (!existing) return err(c, 404, "not-found", `product '${id}'`);
    const parsed = await parseBody(c, Product.partial());
    if (parsed.error) return parsed.response;
    // Apply patch then re-validate the merged object.
    const merged = Product.parse({ ...existing, ...parsed.data, id });
    deps.db.run(
      `UPDATE product SET name=?, category=?, subcategory=?, abv=?, density_g_ml=?, default_ml=?, flavor_tags=?, notes=? WHERE id=?`,
      [
        merged.name,
        merged.category,
        merged.subcategory ?? null,
        merged.abv ?? null,
        merged.density_g_ml ?? null,
        merged.default_ml ?? null,
        JSON.stringify(merged.flavor_tags),
        merged.notes ?? null,
        id,
      ],
    );
    return c.json(merged);
  });

  return r;
}
