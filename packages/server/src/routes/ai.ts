import { Hono } from "hono";
import { coverage } from "@backbar/core";
import {
  products as productsRepo,
  recipes as recipesRepo,
} from "@backbar/db";
import type { Deps } from "../deps";
import { err, parseBody } from "../errors";
import { loadInventory } from "../makeable";
import { ideate } from "../ai/ideate";
import { importPhoto } from "../ai/import-photo";
import { importInventory } from "../ai/import-inventory";
import { groundBatch } from "../ai/ground-inventory";
import { lookupProduct } from "../ai/product-lookup";
import { buildRefSet } from "../ai/prompts";
import { IdeateRequest, PhotoImportRequest, ProductLookupRequest } from "../ai/schema";

/**
 * AI routes (spec ai-engine.md §5).
 *
 * - `POST /ai/ideate` — generate+repair loop against live inventory.
 *   `mode:"now"` is strict; `mode:"riff"` rotates one axis on a template
 *   recipe. Returns `{ok:true, spec}` on success, `{ok:false, reason:
 *   "off-inventory", ...}` after 2 failed attempts — never silently swaps.
 *
 * - `GET /ai/shopping` — deterministic coverage muse. `?preview=1` re-ideates
 *   the top suggestion as if it were already in stock, to preview the drink
 *   it unlocks.
 *
 * - `POST /recipes/import-photo` — vision recipe import; returns a draft
 *   (never auto-saved) with unresolved labels for human binding.
 */
export function aiRouter(deps: Deps, opts: { hasGateway: boolean } = { hasGateway: false }) {
  const r = new Hono();

  r.post("/ideate", async (c) => {
    const parsed = await parseBody(c, IdeateRequest);
    if (parsed.error) return parsed.response;

    if (!opts.hasGateway) {
      return err(c, 503, "ai-disabled", "AI_GATEWAY_API_KEY not set");
    }

    const inv = loadInventory(deps.db);
    const { brief, mode, recipe_id, constraints } = parsed.data;

    let recipe = undefined;
    if (mode === "riff") {
      if (!recipe_id) {
        return err(c, 400, "validation", "mode='riff' requires recipe_id");
      }
      const found = recipesRepo(deps.db).get(recipe_id);
      if (!found) return err(c, 404, "not-found", `recipe '${recipe_id}'`);
      recipe = found;
    }

    const result = await ideate({ brief, mode, constraints, recipe }, { inv });
    if (result.ok) return c.json(result);
    if (result.reason === "bad-input") {
      return err(c, 400, "validation", result.detail);
    }
    // off-inventory — route caller toward shopping-muse for the gap.
    return c.json(
      {
        ok: false,
        reason: result.reason,
        violation: result.violation,
        last_spec: result.last_spec,
        attempts: result.attempts,
        muse_hint: "GET /ai/shopping for unlocks; the brief needs an item not in stock.",
      },
      422,
    );
  });

  r.get("/shopping", async (c) => {
    const oneAway = deps.makeable.list().filter((m) => m.state === "one-away");
    const recipeMap = new Map(recipesRepo(deps.db).list().map((r) => [r.id, r] as const));
    const productMap = new Map(productsRepo(deps.db).list().map((p) => [p.id, p] as const));
    const inv = loadInventory(deps.db);
    const ranked = coverage(oneAway, recipeMap, inv).map((m) => ({
      product: productMap.get(m.product) ?? { id: m.product },
      unlocks: m.unlocks,
    }));

    // Optional preview: ideate the top suggestion as if it were already in
    // stock — same generate+repair loop, just with an expanded validRefs.
    const wantPreview = c.req.query("preview") === "1" || c.req.query("preview") === "true";
    let preview: unknown = undefined;
    if (wantPreview && opts.hasGateway && ranked.length > 0) {
      const top = ranked[0]!;
      const topProduct = productMap.get(top.product.id);
      if (topProduct) {
        const refs = buildRefSet(inv);
        refs.add(topProduct.id);
        refs.add(topProduct.category);
        const previewResult = await ideate(
          {
            brief: `Design a drink that showcases ${topProduct.name}. Highlight its character.`,
            mode: "now",
            constraints: { mustUse: [topProduct.id] },
            validRefs: refs,
          },
          { inv },
        );
        preview = previewResult.ok
          ? { product_id: topProduct.id, unlocks: top.unlocks, spec: previewResult.spec }
          : { product_id: topProduct.id, unlocks: top.unlocks, error: previewResult.reason };
      }
    }

    return c.json({ ranked, preview });
  });

  /**
   * POST /ai/product-lookup — Haiku-extract product metadata for the Add
   * Product modal. Returns a confidence-scored draft; the operator confirms
   * + edits any field before submit. Per specs/inventory-model.md §3a + §3b.
   */
  r.post("/product-lookup", async (c) => {
    const parsed = await parseBody(c, ProductLookupRequest);
    if (parsed.error) return parsed.response;
    if (!opts.hasGateway) {
      return err(c, 503, "ai-disabled", "AI_GATEWAY_API_KEY not set");
    }
    const result = await lookupProduct(parsed.data);
    if (result.ok) return c.json(result);
    if (result.reason === "no-model") {
      return err(c, 503, "ai-disabled", "no gateway model available");
    }
    return err(c, 502, "extract-failed", result.detail);
  });

  return r;
}

/**
 * POST /inventory/import-photo — bulk import from a bar shelf photo.
 *
 * Two-step pipeline:
 *   1. Vision model (gpt-4o) extracts every visible bottle (display_name,
 *      expression, fill_observed, confidence). Grounding slots remain null.
 *   2. Lookup model (Haiku) grounds each candidate in parallel, resolving
 *      brand/distillery/category/ABV/size/origin with provenance.
 *
 * Returns a draft list for operator review — never auto-committed.
 * Vision failure → 502; grounding failures per-bottle degrade to null
 * fields rather than crashing the batch.
 */
export function inventoryImportRouter(
  _deps: Deps,
  opts: { hasGateway: boolean } = { hasGateway: false },
) {
  const r = new Hono();

  r.post("/import-photo", async (c) => {
    const parsed = await parseBody(c, PhotoImportRequest);
    if (parsed.error) return parsed.response;

    if (!opts.hasGateway) {
      return err(c, 503, "ai-disabled", "AI_GATEWAY_API_KEY not set");
    }

    // Step 1 — vision detection
    const detection = await importInventory(parsed.data, {});
    if (!detection.ok) {
      if (detection.reason === "no-model") {
        return err(c, 503, "ai-disabled", "no gateway model available");
      }
      return err(c, 502, "extract-failed", detection.detail);
    }

    // Step 2 — grounded lookup (parallel; per-bottle failures degrade, never crash)
    const bottles = await groundBatch(detection.bottles);

    return c.json({
      bottles,
      detection_attempts: detection.attempts,
    });
  });

  return r;
}

export function recipesPhotoImportRouter(
  deps: Deps,
  opts: { hasGateway: boolean } = { hasGateway: false },
) {
  const r = new Hono();

  r.post("/import-photo", async (c) => {
    const parsed = await parseBody(c, PhotoImportRequest);
    if (parsed.error) return parsed.response;

    if (!opts.hasGateway) {
      return err(c, 503, "ai-disabled", "AI_GATEWAY_API_KEY not set");
    }

    const products = productsRepo(deps.db).list();
    const result = await importPhoto(parsed.data, { products });
    if (!result.ok) {
      if (result.reason === "no-model") {
        return err(c, 503, "ai-disabled", "no gateway model available");
      }
      return err(c, 502, "extract-failed", result.detail);
    }
    return c.json({
      draft: result.draft,
      unresolved: result.unresolved,
      image_hash: result.image_hash,
    });
  });

  return r;
}
