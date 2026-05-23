import { Hono } from "hono";
import { coverage } from "@backbar/core";
import { products as productsRepo, recipes as recipesRepo } from "@backbar/db";
import type { Deps } from "../deps";
import { err, parseBody } from "../errors";
import { loadInventory } from "../makeable";
import { IdeateRequest, PhotoImportRequest } from "../ai/schema";

/**
 * AI routes. Generation calls require `AI_GATEWAY_API_KEY`; without it both
 * routes return `503 ai-disabled`. The full Vercel-AI-SDK wiring lives in
 * task-006 (ai-engine.md). Routes are scaffolded here so the surface from
 * §5 is complete and the inventory-validation contract is enforced
 * regardless of which AI provider lights up later.
 *
 * `/ai/shopping` is *deterministic* (no model call) per spec §5 — it's a
 * coverage scan over one-away recipes, so it works even without an AI key.
 */
export function aiRouter(deps: Deps, opts: { hasGateway: boolean } = { hasGateway: false }) {
  const r = new Hono();

  r.post("/ideate", async (c) => {
    const parsed = await parseBody(c, IdeateRequest);
    if (parsed.error) return parsed.response;

    if (!opts.hasGateway) {
      return err(c, 503, "ai-disabled", "AI_GATEWAY_API_KEY not set");
    }

    // Real impl: ai/ideate.ts + generate+repair loop. Stub returns the inventory
    // surface the model would see so callers can verify wiring.
    const inv = loadInventory(deps.db);
    return c.json({
      ok: false,
      reason: "not-implemented",
      brief: parsed.data.brief,
      mode: parsed.data.mode,
      inventory_lines: inv.map((b) => `${b.product_id} | ${b.product.category}`),
    });
  });

  r.get("/shopping", (c) => {
    // Deterministic — coverage over current one-away recipes (spec §5 muse).
    const oneAway = deps.makeable.list().filter((m) => m.state === "one-away");
    const recipeMap = new Map(recipesRepo(deps.db).list().map((r) => [r.id, r] as const));
    const productMap = new Map(productsRepo(deps.db).list().map((p) => [p.id, p] as const));
    const inv = loadInventory(deps.db);
    const ranked = coverage(oneAway, recipeMap, inv).map((m) => ({
      product: productMap.get(m.product) ?? { id: m.product },
      unlocks: m.unlocks,
    }));
    return c.json({ ranked });
  });

  return r;
}

export function recipesPhotoImportRouter(deps: Deps, opts: { hasGateway: boolean } = { hasGateway: false }) {
  const r = new Hono();

  r.post("/import-photo", async (c) => {
    const parsed = await parseBody(c, PhotoImportRequest);
    if (parsed.error) return parsed.response;
    void deps; // reserved for fuzzy-match against existing products in task-006

    if (!opts.hasGateway) {
      return err(c, 503, "ai-disabled", "AI_GATEWAY_API_KEY not set");
    }
    return c.json({
      draft: null,
      unresolved: [] as string[],
      ok: false,
      reason: "not-implemented",
    });
  });

  return r;
}
