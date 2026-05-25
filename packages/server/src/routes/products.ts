import { Hono } from "hono";
import { z } from "zod";
import { Product, ProductTag } from "@backbar/core";
import { productTags as productTagsRepo, products as productsRepo } from "@backbar/db";
import type { Deps } from "../deps";
import { err, parseBody } from "../errors";

/**
 * The POST /products body accepts an optional `tags` array (per
 * specs/inventory-model.md §3b) so the operator can drop a product +
 * its taxonomy bindings in one round-trip.
 */
const ProductCreate = Product.extend({
  tags: z
    .array(
      z.object({
        namespace: z.string().min(1),
        value: z.string().min(1),
      }),
    )
    .optional(),
});

const TagReplaceBody = z.object({
  tags: z.array(
    z.object({
      namespace: z.string().min(1),
      value: z.string().min(1),
    }),
  ),
});

export function productsRouter(deps: Deps) {
  const r = new Hono();

  r.get("/", (c) => {
    const all = productsRepo(deps.db).list();
    // For the list view: attach the tag set per product in a single pass
    // (one query, server-side join is cheaper than N+1 client-side fetches).
    const tagsByProduct = new Map<string, ProductTag[]>();
    for (const t of productTagsRepo(deps.db).list()) {
      const list = tagsByProduct.get(t.product_id) ?? [];
      list.push(t);
      tagsByProduct.set(t.product_id, list);
    }
    return c.json(all.map((p) => ({ ...p, tags: tagsByProduct.get(p.id) ?? [] })));
  });

  r.get("/:id", (c) => {
    const id = c.req.param("id");
    const product = productsRepo(deps.db).get(id);
    if (!product) return err(c, 404, "not-found", `product '${id}'`);
    return c.json({ ...product, tags: productTagsRepo(deps.db).forProduct(id) });
  });

  r.post("/", async (c) => {
    const parsed = await parseBody(c, ProductCreate);
    if (parsed.error) return parsed.response;
    if (productsRepo(deps.db).get(parsed.data.id)) {
      return err(c, 409, "duplicate", `product '${parsed.data.id}' already exists`);
    }
    const { tags, ...productFields } = parsed.data;
    const created = productsRepo(deps.db).insert(productFields);
    if (tags && tags.length > 0) {
      for (const t of tags) {
        productTagsRepo(deps.db).add({ product_id: created.id, ...t });
      }
    }
    // Tag changes can flip makeability for tag-ref'd recipes.
    deps.makeable.recompute();
    return c.json({ ...created, tags: productTagsRepo(deps.db).forProduct(created.id) }, 201);
  });

  r.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const existing = productsRepo(deps.db).get(id);
    if (!existing) return err(c, 404, "not-found", `product '${id}'`);
    const parsed = await parseBody(c, Product.partial());
    if (parsed.error) return parsed.response;
    const merged = Product.parse({ ...existing, ...parsed.data, id });
    deps.db.run(
      `UPDATE product SET
         name=?, category=?, subcategory=?, abv=?, density_g_ml=?, default_ml=?,
         flavor_tags=?, notes=?,
         distillery=?, origin_country=?, origin_region=?, producer_url=?, age_statement_y=?
       WHERE id=?`,
      [
        merged.name,
        merged.category,
        merged.subcategory ?? null,
        merged.abv ?? null,
        merged.density_g_ml ?? null,
        merged.default_ml ?? null,
        JSON.stringify(merged.flavor_tags),
        merged.notes ?? null,
        merged.distillery ?? null,
        merged.origin_country ?? null,
        merged.origin_region ?? null,
        merged.producer_url ?? null,
        merged.age_statement_y ?? null,
        id,
      ],
    );
    return c.json(merged);
  });

  /**
   * PUT /products/:id/tags — replace the product's tag set wholesale.
   * Pragmatic UX shape: the form sends what the tag set *should be*; the
   * server diffs (delete all, re-insert) inside one transaction.
   */
  r.put("/:id/tags", async (c) => {
    const id = c.req.param("id");
    if (!productsRepo(deps.db).get(id)) return err(c, 404, "not-found", `product '${id}'`);
    const parsed = await parseBody(c, TagReplaceBody);
    if (parsed.error) return parsed.response;
    deps.db.transaction(() => {
      productTagsRepo(deps.db).removeAllFor(id);
      for (const t of parsed.data.tags) {
        productTagsRepo(deps.db).add({ product_id: id, ...t });
      }
    })();
    deps.makeable.recompute();
    return c.json({ tags: productTagsRepo(deps.db).forProduct(id) });
  });

  /** GET /tags/namespaces — distinct namespaces present in the catalog. */
  r.get("/_/namespaces", (c) => c.json(productTagsRepo(deps.db).namespaces()));

  return r;
}
