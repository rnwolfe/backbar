import { Hono } from "hono";
import type { UIMessage } from "ai";
import { coverage, type Product } from "@backbar/core";
import {
  bottles as bottlesRepo,
  components as componentsRepo,
  products as productsRepo,
  recipes as recipesRepo,
} from "@backbar/db";
import type { Deps } from "../deps";
import { err, parseBody } from "../errors";
import { loadInventory } from "../makeable";
import { ChatRequest, streamChat } from "../ai/chat";
import { listThreads, loadThread, saveThread } from "../ai/chat-store";
import { ideate } from "../ai/ideate";
import { importPhoto } from "../ai/import-photo";
import { importInventory } from "../ai/import-inventory";
import { groundBatch } from "../ai/ground-inventory";
import { lookupProduct } from "../ai/product-lookup";
import { buildRefSet } from "../ai/prompts";
import {
  BulkPhotoImportRequest,
  type GroundedBottle,
  IdeateRequest,
  PhotoImportRequest,
  ProductLookupRequest,
} from "../ai/schema";

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

  // POST /ai/chat — streaming agentic bartender (AI-SDK UI message stream).
  // Returns a UI-message-stream Response consumed by the operator-ui chat dock.
  r.post("/chat", async (c) => {
    if (!opts.hasGateway) return err(c, 503, "ai-disabled", "AI_GATEWAY_API_KEY not set");
    const parsed = await parseBody(c, ChatRequest);
    if (parsed.error) return parsed.response;
    const threadId = c.req.query("thread") ?? undefined;
    try {
      return streamChat(deps, {
        messages: parsed.data.messages as UIMessage[],
        context: parsed.data.context,
        onFinish: threadId ? (messages) => saveThread(deps, threadId, messages) : undefined,
      });
    } catch (e) {
      // ai-disabled is reserved for "no gateway model"; anything else is a 500.
      if (e instanceof Error && e.message === "ai-disabled") {
        return err(c, 503, "ai-disabled", "no gateway model available");
      }
      return err(c, 500, "chat-failed", e instanceof Error ? e.message : "chat error");
    }
  });

  // Thread history for the dock.
  r.get("/chat/threads", (c) => c.json(listThreads(deps)));
  r.get("/chat/threads/:id", (c) => c.json(loadThread(deps, c.req.param("id"))));

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

  /**
   * POST /inventory/import-photo-bulk — import from multiple shelf photos at once.
   *
   * Processes each image independently through the same two-step pipeline as
   * /import-photo (vision detection → grounding). Results are flattened into a
   * single candidate list tagged with image_index/image_id. Each candidate is
   * reconciled against the existing product catalog:
   *   "existing-product" → product already cataloged; operator adds a bottle.
   *   "new-product"      → no catalog match; operator creates product first.
   *
   * Per-image failures are isolated — one bad image returns an error entry in
   * per_image[] but does not fail the whole batch.
   */
  r.post("/import-photo-bulk", async (c) => {
    const parsed = await parseBody(c, BulkPhotoImportRequest);
    if (parsed.error) return parsed.response;

    if (!opts.hasGateway) {
      return err(c, 503, "ai-disabled", "AI_GATEWAY_API_KEY not set");
    }

    const products = productsRepo(deps.db).list();
    // Count open bottles per product so the review UI can flag candidates that
    // would duplicate a product you already have on hand (the main source of
    // import "flooding" — re-scanning a shelf adds another bottle each time).
    const openByProduct = new Map<string, number>();
    for (const b of bottlesRepo(deps.db).list()) {
      if (b.status === "open") openByProduct.set(b.product_id, (openByProduct.get(b.product_id) ?? 0) + 1);
    }

    const settled = await Promise.allSettled(
      parsed.data.images.map(async (img, idx) => {
        const detection = await importInventory(
          { image_b64: img.image_b64, media_type: img.media_type },
          {},
        );
        if (!detection.ok) {
          return {
            image_index: idx,
            image_id: img.id,
            status: "failed" as const,
            error:
              detection.reason === "no-model"
                ? "no gateway model available"
                : (detection.detail ?? "extract-failed"),
          };
        }
        const bottles = await groundBatch(detection.bottles);
        return {
          image_index: idx,
          image_id: img.id,
          status: "ok" as const,
          detection_attempts: detection.attempts,
          bottles,
        };
      }),
    );

    const candidates: unknown[] = [];
    const per_image: unknown[] = [];

    for (const result of settled) {
      // inner async never rejects (errors are caught above), but guard for safety
      if (result.status === "rejected") continue;
      const r = result.value;
      const imageId = r.image_id !== undefined ? { image_id: r.image_id } : {};

      if (r.status === "failed") {
        per_image.push({ image_index: r.image_index, ...imageId, status: "failed", error: r.error });
      } else {
        per_image.push({
          image_index: r.image_index,
          ...imageId,
          status: "ok",
          bottle_count: r.bottles.length,
          detection_attempts: r.detection_attempts,
        });
        for (const bottle of r.bottles) {
          const matchedId = reconcileCandidate(bottle, products);
          candidates.push({
            ...bottle,
            image_index: r.image_index,
            ...imageId,
            reconciliation: matchedId ? "existing-product" : "new-product",
            ...(matchedId ? { matched_product_id: matchedId } : {}),
            existing_open_bottles: matchedId ? (openByProduct.get(matchedId) ?? 0) : 0,
          });
        }
      }
    }

    return c.json({ candidates, per_image });
  });

  return r;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeLabel(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim();
}

function tokenizeLabel(s: string): string[] {
  return s.split(/[\s-]+/).filter(Boolean);
}

/**
 * Reconcile a grounded bottle candidate against the product catalog.
 * Returns the matched product ID ("existing-product") or null ("new-product").
 *
 * Strategy: fuzzy-match display_name (and optionally grounded brand) against
 * product names using the same scoring approach as import-photo.ts.
 * Threshold ≥40 to keep false-positive rate low — operator confirms anyway.
 */
function reconcileCandidate(candidate: GroundedBottle, products: Product[]): string | null {
  const l = normalizeLabel(candidate.display_name);
  if (!l) return null;
  const tokens = tokenizeLabel(l);

  let best: { id: string; score: number } | null = null;

  for (const p of products) {
    const name = normalizeLabel(p.name);
    if (!name) continue;

    if (name === l) return p.id;

    if (l.includes(name) || name.includes(l)) {
      const score = 80 - Math.abs(name.length - l.length);
      if (!best || score > best.score) best = { id: p.id, score };
    }

    const nameTokens = tokenizeLabel(name);
    const overlap = nameTokens.filter((t) => t.length >= 3 && tokens.includes(t)).length;
    if (overlap > 0) {
      const score = 50 + overlap * 5;
      if (!best || score > best.score) best = { id: p.id, score };
    }

    if (candidate.brand) {
      const brand = normalizeLabel(candidate.brand);
      if (brand && (name.includes(brand) || brand.includes(name))) {
        const score = 45;
        if (!best || score > best.score) best = { id: p.id, score };
      }
    }
  }

  return best && best.score >= 40 ? best.id : null;
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
    const existingComponents = componentsRepo(deps.db).list();
    const result = await importPhoto(parsed.data, { products, components: existingComponents });
    if (!result.ok) {
      if (result.reason === "no-model") {
        return err(c, 503, "ai-disabled", "no gateway model available");
      }
      return err(c, 502, "extract-failed", result.detail);
    }
    return c.json({
      draft: result.draft,
      unresolved: result.unresolved,
      components: result.components,
      image_hash: result.image_hash,
    });
  });

  return r;
}
