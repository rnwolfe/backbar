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

/**
 * Fire a Vercel deploy hook so the Vercel project rebuilds with the freshly
 * written snapshot. Deploy hooks are Vercel's canonical "external event
 * triggers a redeploy" primitive — a single HTTP POST, no token required;
 * they're per-project URLs operators paste into env as VERCEL_DEPLOY_HOOK.
 * Failure is non-fatal: the snapshot is on disk, the operator can retry.
 */
async function triggerVercelDeploy(url: string): Promise<{ ok: boolean; status?: number; detail?: string }> {
  try {
    const res = await fetch(url, { method: "POST" });
    if (!res.ok) return { ok: false, status: res.status, detail: await res.text().catch(() => "") };
    return { ok: true, status: res.status };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

export function menuRouter(deps: Deps) {
  const r = new Hono();

  // The Caddy serve-mode (spec §6) reads this as `/api/guest/menu`. We expose
  // it under `/guest/menu` because the operator API is mounted at `/`; the
  // Caddyfile rewrites the prefix.
  r.get("/menu", (c) => c.json(buildGuestMenu(deps)));

  // POST /menu/publish — behavior depends on the configured serve mode:
  //
  //   snapshot (default): rebuild the projection, write menu.json next to the
  //     pre-built guest-ui assets, and (if VERCEL_DEPLOY_HOOK is set) trigger
  //     a Vercel redeploy. Returns {mode, url, count} so the operator UI can
  //     confirm the round-trip.
  //   caddy: no-op — the live `/guest/menu` endpoint already reflects the
  //     current inventory, so there's nothing to write. Returns
  //     {mode:"caddy", url: GUEST_PUBLIC_URL, count} for symmetry.
  r.post("/menu/publish", async (c) => {
    // Recompute makeability so the published projection reflects the current
    // inventory — without this, a recent pour / restock wouldn't show up
    // until the next ingest event triggered the cache refresh.
    deps.makeable.recompute();
    const items = buildGuestMenu(deps);

    if (deps.guestMenu.mode === "caddy") {
      return c.json({
        mode: "caddy",
        url: deps.guestMenu.publicUrl ?? null,
        count: items.length,
        note: "Caddy serve mode — /guest/menu is read live; no publish required.",
      });
    }

    await mkdir(deps.guestMenu.outDir, { recursive: true });
    const filePath = join(deps.guestMenu.outDir, "menu.json");
    await writeFile(filePath, JSON.stringify(items, null, 2), "utf8");

    const fileUrl = `file://${filePath}`;
    const reported = deps.guestMenu.publicUrl ?? fileUrl;

    let vercel: { triggered: boolean; ok?: boolean; status?: number; detail?: string } | undefined;
    if (deps.guestMenu.vercelDeployHook) {
      const result = await triggerVercelDeploy(deps.guestMenu.vercelDeployHook);
      vercel = { triggered: true, ...result };
    }

    return c.json({
      mode: "snapshot",
      url: reported,
      count: items.length,
      ...(vercel ? { vercel } : {}),
    });
  });

  return r;
}
