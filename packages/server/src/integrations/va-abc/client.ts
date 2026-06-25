/**
 * Thin, read-only client for Virginia ABC's undocumented endpoints. A TypeScript
 * port of the Go `vabc` CLI's API layer (~/dev/clis/vabc). See ./CONTRACT.md for
 * the pinned request shapes and field encodings.
 *
 * Scope on purpose tiny: just the two calls `ProcurementSource.lookup()` needs —
 * Coveo product search (name → 6-digit SKU + price) and `storeNearby` (per-store
 * stock + nearby stores ranked by distance). No mutations exist upstream.
 *
 * Failure posture: every method throws on a hard failure; the caller
 * (`source.ts`) converts that to a `null` result. Nothing here ever assumes the
 * endpoints behave — responses are parsed defensively.
 */
import { z } from "zod";

export const DEFAULT_BASE_URL = "https://www.abc.virginia.gov";
const DEFAULT_USER_AGENT = "backbar/va-abc (+https://github.com/rnwolfe/vabc)";
const DEFAULT_MIN_INTERVAL_MS = 300;
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;

export interface VaAbcClientOptions {
  baseURL?: string;
  userAgent?: string;
  /** Minimum spacing between outbound requests (politeness throttle). */
  minIntervalMs?: number;
  timeoutMs?: number;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/** A catalog product resolved from Coveo search. */
export interface VaAbcProduct {
  /** 6-digit zero-padded inventory product code. */
  code: string;
  name: string;
  priceCents: number | null;
  allocated: boolean;
  url: string | null;
}

/** One store's stock of a product. */
export interface VaAbcStore {
  storeNumber: number;
  quantity: number;
  distanceMi: number | null;
  city: string | null;
  address: string | null;
  url: string | null;
}

/** `storeNearby` result: anchor store + nearby stores ranked by distance. */
export interface VaAbcInventory {
  code: string;
  anchor: VaAbcStore;
  nearby: VaAbcStore[];
}

/** Raised for upstream failures the caller should treat as "no data". */
export class VaAbcError extends Error {
  constructor(
    message: string,
    readonly kind: "rate-limited" | "not-found" | "upstream" | "network" | "schema",
  ) {
    super(message);
    this.name = "VaAbcError";
  }
}

// ─── upstream response shapes (parsed defensively) ──────────────────────────

const CoveoResponse = z.object({
  results: z
    .array(
      z.object({
        clickUri: z.string().optional(),
        raw: z.record(z.unknown()).default({}),
      }),
    )
    .default([]),
});

// storeInfo / nearbyStores entries. Undocumented, so unknowns pass through and
// only the fields we use are typed. Coerce loosely — upstream mixes string/number.
const RawStore = z.object({
  storeId: z.coerce.number().int(),
  quantity: z.coerce.number().int().default(0),
  distance: z.coerce.number().optional(),
  city: z.string().optional(),
  address: z.string().optional(),
  url: z.string().optional(),
});

const RawInventory = z.object({
  products: z
    .array(
      z.object({
        storeInfo: RawStore,
        nearbyStores: z.array(RawStore).default([]),
      }),
    )
    .default([]),
});

export class VaAbcClient {
  private readonly baseURL: string;
  private readonly userAgent: string;
  private readonly minIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  /** Serializes + spaces outbound requests (in-process politeness throttle). */
  private gate: Promise<void> = Promise.resolve();
  private lastCallAt = 0;

  constructor(opts: VaAbcClientOptions = {}) {
    this.baseURL = (opts.baseURL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
    this.minIntervalMs = opts.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /** Live Coveo product search. Returns matches carrying the inventory code. */
  async searchProducts(query: string, limit = 25): Promise<VaAbcProduct[]> {
    const body = { q: query, numberOfResults: limit > 0 ? limit : 25, firstResult: 0 };
    const json = await this.request(`${this.baseURL}/coveo/rest/search/v2`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    const parsed = CoveoResponse.safeParse(json);
    if (!parsed.success) throw new VaAbcError("coveo: unexpected response shape", "schema");
    const out: VaAbcProduct[] = [];
    for (const r of parsed.data.results) {
      const p = productFromCoveo(r.raw, r.clickUri ?? null);
      if (p) out.push(p);
    }
    return out;
  }

  /** Anchor store's stock of a product + nearby stores stocking it. */
  async storeNearby(storeNumber: number, productCode: string): Promise<VaAbcInventory> {
    const code = pad6(productCode);
    const url = `${this.baseURL}/webapi/inventory/storeNearby?storeNumber=${storeNumber}&productCode=${code}`;
    const json = await this.request(url, { method: "GET" });
    const parsed = RawInventory.safeParse(json);
    if (!parsed.success) throw new VaAbcError("storeNearby: unexpected response shape", "schema");
    const row = parsed.data.products[0];
    if (!row) throw new VaAbcError(`no inventory record for ${code} @ store ${storeNumber}`, "not-found");
    return {
      code,
      anchor: toStore(row.storeInfo),
      nearby: row.nearbyStores.map(toStore),
    };
  }

  // ── transport ──────────────────────────────────────────────────────────

  private async request(url: string, init: RequestInit): Promise<unknown> {
    let lastErr: VaAbcError | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await this.acquire();
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          ...init,
          headers: {
            Accept: "application/json",
            "User-Agent": this.userAgent,
            ...(init.method === "POST" ? { "Content-Type": "application/json" } : {}),
            ...(init.headers ?? {}),
          },
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (e) {
        lastErr = new VaAbcError(`request failed: ${(e as Error).message}`, "network");
        if (attempt < MAX_RETRIES) {
          await sleep(backoff(attempt));
          continue;
        }
        throw lastErr;
      }

      const text = await res.text();
      if (res.status === 200) {
        try {
          return JSON.parse(text) as unknown;
        } catch {
          throw new VaAbcError(`could not decode ${url}`, "schema");
        }
      }
      if (res.status === 400) throw new VaAbcError(firstLine(text) || "bad request", "not-found");
      if (res.status === 429 || isChallenge(res.status, text)) {
        throw new VaAbcError("blocked or rate-limited by upstream", "rate-limited");
      }
      if (res.status >= 500) {
        lastErr = new VaAbcError(`upstream error ${res.status}`, "upstream");
        if (attempt < MAX_RETRIES) {
          await sleep(backoff(attempt));
          continue;
        }
        throw lastErr;
      }
      throw new VaAbcError(`unexpected status ${res.status}`, "upstream");
    }
    throw lastErr ?? new VaAbcError("request failed", "network");
  }

  /** Spaces requests by `minIntervalMs`, serialized through a promise chain. */
  private acquire(): Promise<void> {
    const next = this.gate.then(async () => {
      const wait = this.lastCallAt + this.minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastCallAt = Date.now();
    });
    // Don't let a rejection poison the chain for subsequent callers.
    this.gate = next.catch(() => undefined);
    return next;
  }
}

// ─── mapping helpers (ported from coveo.go / inventory.go) ───────────────────

function toStore(r: z.infer<typeof RawStore>): VaAbcStore {
  return {
    storeNumber: r.storeId,
    quantity: r.quantity,
    distanceMi: r.distance ?? null,
    city: r.city ?? null,
    address: r.address ?? null,
    url: r.url ?? null,
  };
}

/**
 * Map a Coveo raw-field map to a product. Returns null for non-product results
 * (no SKU). Field names are Coveo's char-encoded keys — see CONTRACT.md.
 */
export function productFromCoveo(raw: Record<string, unknown>, clickUri: string | null): VaAbcProduct | null {
  const code = pad6(firstToken(rawString(raw["z95xproductz32xskuz32xids"])));
  if (!code || code === "000000") return null;
  const price = rawFloat(raw["z95xproductz32xpricez32xsort"]);
  const name = rawString(raw["productz32xlabelz32xname"]) || rawString(raw["pagez32xtitle"]);
  return {
    code,
    name,
    priceCents: price != null ? Math.round(price * 100) : null,
    allocated:
      rawBool01(raw["z95xproductz32xlimitedz32xavailability"]) || rawBool01(raw["z95xproductz32xlottery"]),
    url: clickUri,
  };
}

function rawString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.length ? rawString(v[0]) : "";
  return String(v).trim();
}

function rawFloat(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (Array.isArray(v)) return v.length ? rawFloat(v[0]) : null;
  if (typeof v === "string") {
    const n = Number.parseFloat(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function rawBool01(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v === "1" || v.toLowerCase() === "true";
  if (Array.isArray(v)) return v.length ? rawBool01(v[0]) : false;
  return false;
}

/** First whitespace/comma-separated token. */
function firstToken(s: string): string {
  const t = s.trim();
  const m = t.match(/^[^\s,]+/);
  return m ? m[0] : "";
}

/** Normalize a product code to the 6-digit zero-padded form the API expects. */
export function pad6(code: string): string {
  const c = code.trim();
  return c.length < 6 ? c.padStart(6, "0") : c;
}

function isChallenge(status: number, body: string): boolean {
  if (status !== 403 && status !== 503) return false;
  const b = body.toLowerCase();
  return (
    b.includes("just a moment") ||
    b.includes("cf-challenge") ||
    b.includes("/cdn-cgi/") ||
    b.includes("attention required")
  );
}

function firstLine(body: string): string {
  try {
    const m = JSON.parse(body) as Record<string, unknown>;
    for (const k of ["message", "error", "Message"]) {
      const v = m[k];
      if (typeof v === "string" && v) return v;
    }
  } catch {
    /* not JSON */
  }
  const line = body.split("\n", 1)[0] ?? "";
  return line.length > 200 ? line.slice(0, 200) : line;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const backoff = (attempt: number) => 200 * 2 ** attempt;
