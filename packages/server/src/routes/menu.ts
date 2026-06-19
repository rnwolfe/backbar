import { Hono } from "hono";
import { z } from "zod";
import { recipes as recipesRepo } from "@backbar/db";
import type { Deps } from "../deps";

const PublishBody = z.object({
  /** The operator's curated selection — the complete published set. When
   *  omitted, publish just refreshes the live projection without changing it. */
  recipe_ids: z.array(z.string()).optional(),
});

/**
 * Build the guest menu projection (public shape per spec api.md §6):
 *   { name, family, glass, ice, garnish, instructions, tags }[]
 *
 * Includes only recipes that are `is_published` AND currently `makeable`
 * in the cache. No bottle, level, or product internals.
 */
export function buildGuestMenu(deps: Deps) {
  const recipeMap = new Map(recipesRepo(deps.db).list().map((r) => [r.id, r] as const));
  const items = deps.makeable
    .list()
    .filter((m) => m.state === "makeable" && m.recipe.is_published)
    .map((m) => {
      const r = recipeMap.get(m.recipe_id);
      return {
        name: r?.name ?? m.recipe.name,
        family: r?.family ?? null,
        glass: r?.glass ?? null,
        ice: r?.ice ?? null,
        garnish: r?.garnish ?? null,
        instructions: r?.instructions ?? null,
        tags: r?.tags ?? [],
      };
    });
  return items;
}

export function menuRouter(deps: Deps) {
  const r = new Hono();

  // Served publicly as `/api/guest/menu` on the menu host (the prod server
  // strips the `/api` prefix). Read live — it always reflects the current
  // published ∩ makeable set, so a draining bottle drops a drink immediately.
  r.get("/menu", (c) => c.json(buildGuestMenu(deps)));

  // The configured public guest URL (GUEST_PUBLIC_URL) so the operator console
  // can show + QR the real address without hardcoding it.
  r.get("/menu/info", (c) => c.json({ public_url: deps.guestMenu.publicUrl, count: buildGuestMenu(deps).length }));

  /**
   * POST /menu/publish — make the operator's selection the live guest menu.
   *
   * The body carries `recipe_ids` (the curated set). We persist them as the
   * complete published set (publish those, unpublish the rest), recompute
   * makeability, and the live `/menu` projection immediately reflects it —
   * the same endpoint guests already read. No static snapshot, no Vercel.
   *
   * With no body it's a refresh: recompute + return the current projection,
   * leaving the published set untouched.
   */
  r.post("/menu/publish", async (c) => {
    let recipeIds: string[] | undefined;
    try {
      const parsed = PublishBody.safeParse(await c.req.json());
      if (parsed.success) recipeIds = parsed.data.recipe_ids;
    } catch {
      // No / non-JSON body → treat as a plain refresh.
    }

    if (recipeIds) recipesRepo(deps.db).publishOnly(recipeIds);

    // Recompute so a recent pour / restock is reflected before we project.
    deps.makeable.recompute();
    const items = buildGuestMenu(deps);

    return c.json({
      url: deps.guestMenu.publicUrl,
      count: items.length,
    });
  });

  return r;
}
