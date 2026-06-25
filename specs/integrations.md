# integrations.md — external procurement sources

Detail for spec §10. Integrations stay isolated behind a single interface so
brittleness in unofficial/3rd-party endpoints never leaks into the app. Degrade
to null, never crash.

## ProcurementSource (the contract)

```ts
interface ProcurementSource {
  lookup(product: { name: string; va_abc_code?: string | null }): Promise<LocalStock | null>;
}
```

`null` is a first-class, normal result — "no local data" (feature off, no SKU
match, timeout, rate-limit, schema drift). The app depends ONLY on this
interface; each retailer/state is a separate impl. Adding another is a new impl
with zero churn elsewhere.

`LocalStock`: `{ inStock, priceCents?, stores: { storeNumber, name, city?, distanceMi?, qty }[],
resolvedCode, matchedName?, scope }`.

## va-abc impl (`packages/server/src/integrations/va-abc`)

Virginia ABC local stock & price. Ported from the Go `vabc` CLI
(`~/dev/clis/vabc`, github.com/rnwolfe/vabc) — **that repo is the upstream source
of truth for the reverse-engineered endpoints**; mirror route/field changes into
`CONTRACT.md` when it updates.

- `client.ts` — thin read-only HTTP client: Coveo product search (name → 6-digit
  SKU + price) and `/webapi/inventory/storeNearby` (per-store stock + nearby
  stores ranked by distance). Zod-parsed defensively; in-process politeness
  throttle; Cloudflare-challenge detection; ≤2 retries on 5xx/network.
- `source.ts` — `createVaAbcSource({ homeStore, … })` → `ProcurementSource`.
  Resolution: use pinned `va_abc_code` when present, else Coveo-search by name and
  take the best token-overlap match. TTL cache on both resolution + inventory.
- `CONTRACT.md` — pinned upstream request shapes + Coveo field encodings.

### Wiring
- **Config:** the home store is an operator **setting** — `va_abc.home_store` in the
  generic `app_setting` table (Settings → Local procurement), read live per lookup
  so it applies without a restart. `VA_ABC_BASE_URL` optionally overrides the host
  (env, dev knob only). Generic settings: `GET /settings`, `GET /settings/registry`,
  `PUT /settings/:key` (validated against `SETTINGS_REGISTRY`).
- **Gating:** the `va-abc` feature flag (Settings → Flags) **and** the home-store
  setting. Both must be set; otherwise `/products/:id/local` returns
  `{available:false, reason:"disabled"|"not-configured"}` and does no network.
- **Persistence:** `product.va_abc_code` (migration 0010) pins a product to its
  SKU. A name-resolved code is persisted by `GET /products/:id/local` so later
  lookups are deterministic; the operator can correct a wrong match via
  `PATCH /products/:id`.
- **Endpoint:** `GET /products/:id/local` → always 200; `{ available:false, reason }`
  when off/unconfigured/no-data, else stock + price + nearest stores.
- **Surfacing:** a `LOCAL · VA ABC` cell in ProductDetail (catalog) and
  BottleDetail, lazy-loaded, silent when unavailable. Never blocks the view.

### Hygiene (spec §10)
Unofficial endpoints drift — cache aggressively, back off, keep volume low,
degrade to null. No credentials are involved (nothing to leak). Personal use.
