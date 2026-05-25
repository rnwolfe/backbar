import { Hono } from "hono";
import { z } from "zod";
import { pours as poursRepo, recipes as recipesRepo } from "@backbar/db";
import type { Deps } from "../deps";
import { err } from "../errors";

/**
 * Pour analytics — list + aggregates for the Dash and Pours screens.
 *
 *   GET /pours?since=<ms>&limit=<n>     recent pours, joined w/ recipe meta
 *   GET /pours/summary?days=N           per-day { day_index, pours, ml, top_recipe }
 *   GET /pours/top-recipes?days=N       aggregate counts + ml by recipe
 *   GET /pours/top-bottles?days=N       aggregate ml dispensed by bottle
 *
 * All windows default to 28 days; queries are Zod-validated.
 */

const ListQ = z.object({
  since: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().positive().max(500).default(100),
});

const DaysQ = z.object({
  days: z.coerce.number().int().positive().max(365).default(28),
});

const dayMs = 86_400_000;

export function poursRouter(deps: Deps) {
  const r = new Hono();

  r.get("/", (c) => {
    const parsed = ListQ.safeParse({ since: c.req.query("since"), limit: c.req.query("limit") });
    if (!parsed.success) return err(c, 400, "validation", parsed.error.issues);

    const recipeMap = new Map(recipesRepo(deps.db).list().map((r) => [r.id, r] as const));
    const list = poursRepo(deps.db).list(parsed.data.limit);
    const filtered = parsed.data.since != null ? list.filter((p) => p.made_at >= parsed.data.since!) : list;

    return c.json(
      filtered.map((p) => {
        const ml = p.bottles_used.reduce((s, b) => s + b.ml, 0);
        const recipe = p.recipe_id ? recipeMap.get(p.recipe_id) ?? null : null;
        return {
          id: p.id,
          recipe_id: p.recipe_id,
          recipe_name: recipe?.name ?? null,
          made_at: p.made_at,
          ml: Math.round(ml * 10) / 10,
          bottles_used: p.bottles_used,
        };
      }),
    );
  });

  r.get("/summary", (c) => {
    const parsed = DaysQ.safeParse({ days: c.req.query("days") });
    if (!parsed.success) return err(c, 400, "validation", parsed.error.issues);
    const days = parsed.data.days;

    const recipeMap = new Map(recipesRepo(deps.db).list().map((r) => [r.id, r] as const));
    const cutoff = startOfDay(Date.now()) - (days - 1) * dayMs;
    const all = poursRepo(deps.db).list(5000).filter((p) => p.made_at >= cutoff);

    interface Bucket {
      day_index: number;
      day_start: number;
      pours: number;
      ml: number;
      recipeCounts: Map<string, number>;
    }
    const buckets: Bucket[] = Array.from({ length: days }, (_, i) => ({
      day_index: i,
      day_start: cutoff + i * dayMs,
      pours: 0,
      ml: 0,
      recipeCounts: new Map(),
    }));

    for (const p of all) {
      const bucketIndex = Math.floor((startOfDay(p.made_at) - cutoff) / dayMs);
      if (bucketIndex < 0 || bucketIndex >= days) continue;
      const b = buckets[bucketIndex]!;
      const ml = p.bottles_used.reduce((s, x) => s + x.ml, 0);
      b.pours += 1;
      b.ml += ml;
      const key = p.recipe_id ?? "—";
      b.recipeCounts.set(key, (b.recipeCounts.get(key) ?? 0) + 1);
    }

    return c.json(
      buckets.map((b) => {
        let topId: string | null = null;
        let topCount = -1;
        for (const [id, c] of b.recipeCounts) if (c > topCount) {
          topCount = c;
          topId = id;
        }
        return {
          day_index: b.day_index,
          day_start: b.day_start,
          pours: b.pours,
          ml: Math.round(b.ml * 10) / 10,
          top_recipe_id: topId,
          top_recipe_name: topId ? recipeMap.get(topId)?.name ?? null : null,
        };
      }),
    );
  });

  r.get("/top-recipes", (c) => {
    const parsed = DaysQ.safeParse({ days: c.req.query("days") });
    if (!parsed.success) return err(c, 400, "validation", parsed.error.issues);

    const recipeMap = new Map(recipesRepo(deps.db).list().map((r) => [r.id, r] as const));
    const cutoff = Date.now() - parsed.data.days * dayMs;
    const all = poursRepo(deps.db).list(5000).filter((p) => p.made_at >= cutoff);

    const counts = new Map<string, { count: number; ml: number }>();
    for (const p of all) {
      if (!p.recipe_id) continue;
      const cur = counts.get(p.recipe_id) ?? { count: 0, ml: 0 };
      cur.count += 1;
      cur.ml += p.bottles_used.reduce((s, x) => s + x.ml, 0);
      counts.set(p.recipe_id, cur);
    }

    return c.json(
      Array.from(counts.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .map(([id, agg]) => ({
          recipe_id: id,
          recipe_name: recipeMap.get(id)?.name ?? id,
          count: agg.count,
          ml: Math.round(agg.ml * 10) / 10,
        })),
    );
  });

  r.get("/top-bottles", (c) => {
    const parsed = DaysQ.safeParse({ days: c.req.query("days") });
    if (!parsed.success) return err(c, 400, "validation", parsed.error.issues);

    const cutoff = Date.now() - parsed.data.days * dayMs;
    const all = poursRepo(deps.db).list(5000).filter((p) => p.made_at >= cutoff);

    const tally = new Map<string, number>();
    for (const p of all) {
      for (const b of p.bottles_used) {
        tally.set(b.bottle_id, (tally.get(b.bottle_id) ?? 0) + b.ml);
      }
    }

    return c.json(
      Array.from(tally.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([bottle_id, ml]) => ({ bottle_id, ml: Math.round(ml * 10) / 10 })),
    );
  });

  return r;
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
