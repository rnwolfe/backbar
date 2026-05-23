import { Hono } from "hono";
import { z } from "zod";
import { Bottle, Status } from "@backbar/core";
import { bottles as bottlesRepo, products as productsRepo, uuidv7 } from "@backbar/db";
import type { Deps } from "../deps";
import { err, parseBody } from "../errors";

/**
 * POST shape — most fields optional so the operator can drop a bottle in
 * with just `{product_id}`; the route fills sensible defaults from the
 * product catalog and `full_ml`.
 */
const BottleCreate = Bottle.partial({
  id: true,
  full_ml: true,
  level_ml: true,
  status: true,
  tracked: true,
}).extend({ product_id: Bottle.shape.product_id });

const BottlePatch = Bottle.partial();

export function bottlesRouter(deps: Deps) {
  const r = new Hono();

  r.get("/", (c) => {
    const status = c.req.query("status");
    if (status) {
      const parsed = Status.safeParse(status);
      if (!parsed.success) return err(c, 400, "validation", parsed.error.issues);
    }

    const list = bottlesRepo(deps.db).list();
    const filtered = status ? list.filter((b) => b.status === status) : list;
    const productMap = new Map(productsRepo(deps.db).list().map((p) => [p.id, p] as const));
    return c.json(filtered.map((b) => ({ ...b, product: productMap.get(b.product_id) ?? null })));
  });

  r.post("/", async (c) => {
    const parsed = await parseBody(c, BottleCreate);
    if (parsed.error) return parsed.response;

    const product = productsRepo(deps.db).get(parsed.data.product_id);
    if (!product) return err(c, 404, "not-found", `product '${parsed.data.product_id}'`);

    const full_ml = parsed.data.full_ml ?? product.default_ml ?? 750;
    const bottle = Bottle.parse({
      id: parsed.data.id ?? uuidv7(),
      product_id: parsed.data.product_id,
      slot: parsed.data.slot ?? null,
      tare_g: parsed.data.tare_g ?? null,
      full_ml,
      level_ml: parsed.data.level_ml ?? full_ml,
      status: parsed.data.status ?? "open",
      tracked: parsed.data.tracked ?? false,
      opened_at: parsed.data.opened_at ?? null,
      purchased_at: parsed.data.purchased_at ?? null,
      price_cents: parsed.data.price_cents ?? null,
    });
    const created = bottlesRepo(deps.db).insert(bottle);
    // Inventory changed — refresh makeable; no events here (no level change yet).
    deps.makeable.recompute();
    return c.json(created, 201);
  });

  r.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const existing = bottlesRepo(deps.db).get(id);
    if (!existing) return err(c, 404, "not-found", `bottle '${id}'`);

    const parsed = await parseBody(c, BottlePatch);
    if (parsed.error) return parsed.response;

    const merged = Bottle.parse({ ...existing, ...parsed.data, id });
    deps.db.run(
      `UPDATE bottle SET
         product_id=?, slot=?, tare_g=?, full_ml=?, level_ml=?, status=?, tracked=?,
         opened_at=?, purchased_at=?, price_cents=?
       WHERE id=?`,
      [
        merged.product_id,
        merged.slot ?? null,
        merged.tare_g ?? null,
        merged.full_ml,
        merged.level_ml,
        merged.status,
        merged.tracked ? 1 : 0,
        merged.opened_at ?? null,
        merged.purchased_at ?? null,
        merged.price_cents ?? null,
        id,
      ],
    );
    const { changed } = deps.makeable.recompute();
    for (const ch of changed) deps.bus.emit({ type: "makeable.changed", ...ch });
    return c.json(merged);
  });

  return r;
}
