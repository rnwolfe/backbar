import { Hono } from "hono";
import { z } from "zod";
import { Status, type Bottle, type Category, type Product } from "@backbar/core";
import {
  bottles as bottlesRepo,
  categories as categoriesRepo,
  products as productsRepo,
} from "@backbar/db";
import type { Deps } from "../deps";
import { err, parseBody } from "../errors";
import { applyReading, IngestError } from "../ingest";
import { isLowStock } from "../lowstock";

/**
 * Rapid inventory sweep — server support (spec api.md §2).
 *
 * Two paths back the operator's "go through the shelf, tap a fill level,
 * advance" flow:
 *
 *   GET  /sweep/bottles  — filtered, ordered list with the bottle, product,
 *                          category swatch, and display metadata the tap UI
 *                          renders without further lookups.
 *   POST /sweep/level    — save a quarter fill level or empty/gone for one
 *                          bottle. Every save routes through the same
 *                          append-only `applyReading()` ingest core; empty/gone
 *                          additionally surfaces a shopping-list replacement.
 *
 * The sweep itself stays stateless: the client owns the cursor + ordered ids.
 * The server only filters/orders the source rows and records each save.
 */

/**
 * Fixed control set (spec api.md §2). Empty/gone plus the four quarter fills.
 * `fraction` of `bottle.full_ml` gives the saved `level_ml`; 100% pins to
 * `full_ml` exactly so it never rounds below a full bottle.
 */
export const SWEEP_LEVELS = [
  { key: "empty", label: "Empty / gone", fraction: 0 },
  { key: "25", label: "25%", fraction: 0.25 },
  { key: "50", label: "50%", fraction: 0.5 },
  { key: "75", label: "75%", fraction: 0.75 },
  { key: "100", label: "100%", fraction: 1 },
] as const;

type SweepLevelKey = (typeof SWEEP_LEVELS)[number]["key"];

/** Resolve a control key → saved `level_ml` for a given bottle. */
export function levelMlFor(key: SweepLevelKey, full_ml: number): number {
  if (key === "empty") return 0;
  if (key === "100") return full_ml;
  const fraction = SWEEP_LEVELS.find((l) => l.key === key)!.fraction;
  return Math.round(full_ml * fraction);
}

/** Coerce the various truthy/falsey query spellings into a tristate. */
function boolParam(raw: string | undefined): boolean | undefined {
  if (raw == null) return undefined;
  if (["1", "true", "yes"].includes(raw.toLowerCase())) return true;
  if (["0", "false", "no"].includes(raw.toLowerCase())) return false;
  return undefined;
}

const SweepFilter = z.object({
  status: Status.optional(),
  category: z.string().min(1).optional(),
  tracked: z.boolean().optional(),
  low: z.boolean().optional(),
  q: z.string().min(1).optional(),
});

const SweepLevelBody = z.object({
  bottle_id: z.string().min(1),
  level: z.enum(["empty", "25", "50", "75", "100"]),
});

/** One sweep row — everything the tap UI needs without a second round-trip. */
function sweepRow(bottle: Bottle, product: Product | null, category: Category | null) {
  const fillPct = bottle.full_ml > 0 ? Math.round((bottle.level_ml / bottle.full_ml) * 100) : 0;
  return {
    bottle,
    product,
    category,
    display: {
      name: product?.name ?? bottle.product_id,
      category: product?.category ?? null,
      category_label: category?.label ?? product?.category ?? null,
      category_hue: category?.hue ?? null,
      slot: bottle.slot ?? null,
      status: bottle.status,
      tracked: bottle.tracked,
      level_ml: bottle.level_ml,
      full_ml: bottle.full_ml,
      fill_pct: fillPct,
      low: isLowStock(bottle),
    },
  };
}

export function sweepRouter(deps: Deps) {
  const r = new Hono();

  /**
   * GET /sweep/bottles — the ordered source list for a sweep.
   *
   * Filters (all optional, AND-combined): status, category (product slug),
   * tracked, low (low-stock only), q (case-insensitive product-name search).
   * Ordered by category sort, then product name, then slot — a stable,
   * shelf-walk-friendly order the client can lock as the sweep id list.
   */
  r.get("/bottles", (c) => {
    const parsed = SweepFilter.safeParse({
      status: c.req.query("status"),
      category: c.req.query("category"),
      tracked: boolParam(c.req.query("tracked")),
      low: boolParam(c.req.query("low")),
      q: c.req.query("q"),
    });
    if (!parsed.success) return err(c, 400, "validation", parsed.error.issues);
    const f = parsed.data;

    const productMap = new Map(productsRepo(deps.db).list().map((p) => [p.id, p] as const));
    const categoryMap = new Map(categoriesRepo(deps.db).list().map((cat) => [cat.id, cat] as const));
    const catSort = (slug: string | null | undefined) => {
      const order = slug ? categoryMap.get(slug)?.sort_order : undefined;
      return order ?? Number.MAX_SAFE_INTEGER;
    };
    const needle = f.q?.toLowerCase();

    const rows = bottlesRepo(deps.db)
      .list()
      .filter((b) => {
        if (f.status && b.status !== f.status) return false;
        if (f.tracked !== undefined && b.tracked !== f.tracked) return false;
        if (f.low && !isLowStock(b)) return false;
        const product = productMap.get(b.product_id) ?? null;
        if (f.category && product?.category !== f.category) return false;
        if (needle && !(product?.name ?? "").toLowerCase().includes(needle)) return false;
        return true;
      })
      .map((b) => {
        const product = productMap.get(b.product_id) ?? null;
        return sweepRow(b, product, product ? categoryMap.get(product.category) ?? null : null);
      });

    rows.sort((a, b) => {
      const cs = catSort(a.product?.category) - catSort(b.product?.category);
      if (cs !== 0) return cs;
      const nameCmp = a.display.name.localeCompare(b.display.name);
      if (nameCmp !== 0) return nameCmp;
      return (a.display.slot ?? "").localeCompare(b.display.slot ?? "");
    });

    return c.json({ controls: SWEEP_LEVELS, count: rows.length, bottles: rows });
  });

  /**
   * POST /sweep/level — save one quarter fill level or empty/gone.
   *
   * Body: `{ bottle_id, level: "empty"|"25"|"50"|"75"|"100" }`. The level key
   * maps to a `level_ml` off the bottle's `full_ml` and is written through the
   * append-only ingest core (`applyReading`) — same manual-reading pipeline as
   * `POST /ingest/reading`, so derived level, makeability, and live events stay
   * consistent. For empty/gone the response also carries the shopping-list
   * replacement signal the depleted bottle now produces.
   */
  r.post("/level", async (c) => {
    const parsed = await parseBody(c, SweepLevelBody);
    if (parsed.error) return parsed.response;
    const { bottle_id, level } = parsed.data;

    const bottle = bottlesRepo(deps.db).get(bottle_id);
    if (!bottle) return err(c, 404, "not-found", `bottle '${bottle_id}'`);

    const level_ml = levelMlFor(level, bottle.full_ml);

    try {
      const result = applyReading(deps, { kind: "manual", bottle_id, level_ml });
      const body: Record<string, unknown> = {
        ok: true,
        reading_id: result.reading.id,
        level_ml: result.bottle.level_ml,
        status: result.bottle.status,
        flipped_empty: result.flippedEmpty,
      };
      if (level === "empty") {
        body.shopping_signal = replacementSignal(deps, result.bottle);
      }
      return c.json(body);
    } catch (e) {
      if (e instanceof IngestError && e.code === "unknown-bottle") {
        return err(c, 404, "not-found", e.message);
      }
      if (e instanceof IngestError) return err(c, 422, e.code, e.message);
      throw e;
    }
  });

  return r;
}

/**
 * Build the product-level replacement signal for a just-depleted bottle —
 * the same shape `GET /shopping-list` surfaces under `replacements`. Coalesced
 * by product: marking a second bottle of the same product empty updates the
 * one signal (more depleted ids, lower remaining count) rather than duplicating.
 */
export function replacementSignal(deps: Deps, bottle: Bottle) {
  const all = bottlesRepo(deps.db).list().filter((b) => b.product_id === bottle.product_id);
  const depleted = all.filter((b) => b.status === "empty" || b.level_ml <= 0);
  const remainingInStock = all.filter((b) => b.status !== "empty" && b.level_ml > 0).length;
  const product = productsRepo(deps.db).get(bottle.product_id);
  return {
    product: product ?? { id: bottle.product_id },
    depleted_bottle_ids: depleted.map((b) => b.id),
    remaining_in_stock: remainingInStock,
    out: remainingInStock === 0,
  };
}
