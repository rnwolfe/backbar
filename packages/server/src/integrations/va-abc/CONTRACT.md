# va-abc — pinned request contract

Reverse-engineered, **undocumented** Virginia ABC endpoints. No auth, no credentials.
Ported from the Go `vabc` CLI (`~/dev/clis/vabc`, github.com/rnwolfe/vabc) — that repo is
the upstream source of truth; mirror route/field changes here when it updates.

> ⚠️ These are a courtesy surface (the site's own JS calls them). Param names and the route
> table can change without notice. Everything here is wrapped behind `ProcurementSource` so
> breakage degrades to `null` ("no local data"), never an upward crash. Verified live 2026-06-25.

## Hosts
- Inventory + Coveo search: `https://www.abc.virginia.gov` (`VA_ABC_BASE_URL` to override)
- Store locator (official open data, unused by lookup): Virginia VGIN ArcGIS FeatureServer

## Endpoints we use

### 1. Product search — Coveo (resolve name → SKU + price)
`POST {base}/coveo/rest/search/v2`  ·  body `{ "q": <query>, "numberOfResults": N, "firstResult": 0 }`
Anonymous, not Cloudflare-challenged. Indexes the full web catalog (more complete than the XLSX
price list). Response: `{ totalCount, results: [{ clickUri, raw: {…} }] }`.

Coveo encodes special chars in raw field names: `z32x`=space, `z95x`=`_`, `z120x`=`x`, `z122x`=`z`.
Fields we read:
| field | meaning |
|---|---|
| `z95xproductz32xskuz32xids` | **the inventory `productCode`** (take first token, zero-pad to 6) |
| `productz32xlabelz32xname` (fallback `pagez32xtitle`) | display name |
| `z95xproductz32xpricez32xsort` | retail price (USD) |
| `z95xproductz32xlimitedz32xavailability`, `z95xproductz32xlottery` | allocated/lottery flags |

### 2. Store inventory — `storeNearby` (the "what's in stock near me" call)
`GET {base}/webapi/inventory/storeNearby?storeNumber={n}&productCode={6digit}`
**Both params required** (omit either → `400 Missing required parameter`). `productCode` must be
6-digit zero-padded. Returns the anchor store's stock **plus `nearbyStores[]` ranked by distance**:
```
{ products: [ { productId, storeInfo: <Store>, nearbyStores: [ <Store>, … ] } ] }
```
`<Store>` = `{ storeId, quantity, distance (mi), latitude, longitude, address, address1, city,
state, zip, url, hours, shoppingCenter, PhoneNumber: { FormattedPhoneNumber } }`.

## Hygiene (enforced in client.ts / source.ts)
- **Politeness throttle**: in-process min-interval between requests (server is long-lived, so an
  in-proc gate suffices — the CLI needs a cross-process file because it's fresh-process-per-call).
- **Descriptive User-Agent**, bounded response read, short timeout, ≤2 retries on 5xx/network.
- **Cloudflare-challenge detection** on 403/503 → treat as rate-limited, back off.
- **Cache** product resolution + inventory results (TTL) to keep request volume low.
- **Degrade, never crash**: any error/timeout/disabled → `lookup()` returns `null`.

## Not used by `lookup()` (available upstream if needed later)
`/webapi/inventory/mystore` (single store), `/webapi/inventory/store` (statewide warehouse),
`/webapi/limitedavailability/eventLinks` (lottery hook), ArcGIS store locator.
