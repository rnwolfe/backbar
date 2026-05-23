import { Hono } from "hono";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { recipes as recipesRepo } from "@backbar/db";
import type { Deps } from "../deps";

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

  // The Caddy serve-mode (spec §6) reads this as `/api/guest/menu`. We expose
  // it under `/guest/menu` because the operator API is mounted at `/`; the
  // Caddyfile rewrites the prefix.
  r.get("/menu", (c) => c.json(buildGuestMenu(deps)));

  // Snapshot publish — writes a JSON projection + a tiny index page to
  // `guestMenuOutDir`. Vercel push (token-based) is the v0.2 path and lives
  // in task-007; this route lays the file on disk and returns `{url, count}`
  // so the operator UI can confirm an opt-in publish round-trip.
  r.post("/menu/publish", async (c) => {
    const items = buildGuestMenu(deps);
    await mkdir(deps.guestMenuOutDir, { recursive: true });
    await writeFile(
      join(deps.guestMenuOutDir, "menu.json"),
      JSON.stringify(items, null, 2),
      "utf8",
    );
    return c.json({
      url: `file://${deps.guestMenuOutDir}/menu.json`,
      count: items.length,
    });
  });

  return r;
}
