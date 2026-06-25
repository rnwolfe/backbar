/**
 * ProcurementSource — the stable internal contract the rest of Backbar depends
 * on (spec §10). `va-abc` is one impl; adding another state/retailer later is
 * another impl with zero churn upstream.
 *
 * The whole point is isolation: brittleness in the undocumented endpoints never
 * leaks up. `lookup()` resolves to `null` on *any* failure (disabled, no SKU,
 * timeout, rate-limit, schema drift) — a null just means "no local data."
 */
import { VaAbcClient, type VaAbcClientOptions, type VaAbcStore } from "./client";

/** Minimal product shape the source needs — decoupled from core's Product. */
export interface ProcurementProduct {
  /** Display/search name, e.g. "Planteray Original Dark Rum". */
  name: string;
  /** Pinned VA ABC SKU if already resolved; null/undefined → resolve by name. */
  va_abc_code?: string | null;
}

export interface LocalStore {
  storeNumber: number;
  name: string;
  city: string | null;
  distanceMi: number | null;
  qty: number;
}

export interface LocalStock {
  /** True if any store (anchor or nearby) has qty > 0. */
  inStock: boolean;
  priceCents: number | null;
  /** Stores carrying it (qty > 0), nearest first. */
  stores: LocalStore[];
  /** The 6-digit SKU used — surfaced so the route can persist a resolved match. */
  resolvedCode: string;
  /** VA ABC's name for the matched SKU (lets the operator catch a mis-match). */
  matchedName: string | null;
  /** Human scope string, e.g. "live · VA ABC store 88". */
  scope: string;
}

export interface ProcurementSource {
  /** Local stock for a product, or null when there's no local data. */
  lookup(product: ProcurementProduct): Promise<LocalStock | null>;
}

export interface VaAbcSourceOptions extends VaAbcClientOptions {
  /**
   * Operator's nearest ABC store number — the anchor for `storeNearby`. A
   * function (not a value) so it's read live per lookup: it's an operator
   * setting that can change at runtime without rebuilding the source. Returns
   * null when unset, in which case `lookup()` resolves to null with no network.
   */
  resolveHomeStore: () => number | null;
  /** TTL for cached inventory/resolution results (ms). Default 10 min. */
  ttlMs?: number;
}

interface CacheEntry<T> {
  at: number;
  val: T;
}

const DEFAULT_TTL_MS = 10 * 60 * 1000;

/**
 * Build the VA ABC procurement source. Returns a `ProcurementSource` that the
 * server route calls. Resolution: use the pinned `va_abc_code` when present,
 * else Coveo-search by name and take the best match (the route persists it).
 */
export function createVaAbcSource(opts: VaAbcSourceOptions): ProcurementSource {
  const client = new VaAbcClient(opts);
  const ttl = opts.ttlMs ?? DEFAULT_TTL_MS;
  const resolveCache = new Map<string, CacheEntry<{ code: string; name: string; priceCents: number | null } | null>>();
  const invCache = new Map<string, CacheEntry<LocalStock | null>>();

  function fresh<T>(cache: Map<string, CacheEntry<T>>, key: string): T | undefined {
    const e = cache.get(key);
    if (e && Date.now() - e.at < ttl) return e.val;
    if (e) cache.delete(key);
    return undefined;
  }

  async function resolveCode(
    product: ProcurementProduct,
  ): Promise<{ code: string; name: string; priceCents: number | null } | null> {
    if (product.va_abc_code) {
      return { code: product.va_abc_code, name: product.name, priceCents: null };
    }
    const key = product.name.trim().toLowerCase();
    const cached = fresh(resolveCache, key);
    if (cached !== undefined) return cached;

    let resolved: { code: string; name: string; priceCents: number | null } | null = null;
    try {
      const matches = await client.searchProducts(product.name, 10);
      const best = pickBestMatch(product.name, matches);
      if (best) resolved = { code: best.code, name: best.name, priceCents: best.priceCents };
    } catch {
      resolved = null; // degrade silently
    }
    resolveCache.set(key, { at: Date.now(), val: resolved });
    return resolved;
  }

  return {
    async lookup(product: ProcurementProduct): Promise<LocalStock | null> {
      // Read the home store first — when unset, do no network at all (no Coveo
      // search, no inventory call); there's nowhere to anchor the lookup.
      const homeStore = opts.resolveHomeStore();
      if (homeStore == null) return null;

      const resolved = await resolveCode(product);
      if (!resolved) return null;

      const key = `${homeStore}:${resolved.code}`;
      const cached = fresh(invCache, key);
      if (cached !== undefined) return cached;

      let result: LocalStock | null = null;
      try {
        const inv = await client.storeNearby(homeStore, resolved.code);
        const all: VaAbcStore[] = [inv.anchor, ...inv.nearby];
        const stores: LocalStore[] = all
          .filter((s) => s.quantity > 0)
          .sort((a, b) => (a.distanceMi ?? Infinity) - (b.distanceMi ?? Infinity))
          .map((s) => ({
            storeNumber: s.storeNumber,
            name: `ABC Store ${s.storeNumber}`,
            city: s.city,
            distanceMi: s.distanceMi,
            qty: s.quantity,
          }));
        result = {
          inStock: stores.length > 0,
          priceCents: resolved.priceCents,
          stores,
          resolvedCode: resolved.code,
          matchedName: resolved.name,
          scope: `live · VA ABC store ${homeStore}`,
        };
      } catch {
        result = null; // degrade silently
      }
      invCache.set(key, { at: Date.now(), val: result });
      return result;
    },
  };
}

/**
 * Pick the best search hit for a name. Coveo already ranks by relevance, so the
 * first result is usually right; we additionally prefer a hit that shares the
 * most significant word tokens with the query, falling back to the top result.
 */
function pickBestMatch<T extends { code: string; name: string }>(query: string, matches: T[]): T | null {
  const first = matches[0];
  if (!first) return null;
  const qTokens = tokenize(query);
  let best = first;
  let bestScore = -1;
  for (const m of matches) {
    const mTokens = new Set(tokenize(m.name));
    let score = 0;
    for (const t of qTokens) if (mTokens.has(t)) score++;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}
