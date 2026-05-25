# specs/inventory-model.md

Conceptual guide to the inventory model: **product vs bottle**, how they're related, why the asymmetry matters, and a forward proposal for richer metadata (distillery, origin, Smuggler's Cove rum class, Cocktail Codex root).

Parent: `backbar-architecture-spec.md` §1 (locked decisions) + `data-model.md` §1 (schema). This file is conceptual — schema details still live in `data-model.md`.

---

## 1. The two-layer model

```
                    Recipe                                Pour
                  references                            references
                       │                                    │
                       ▼                                    ▼
                ┌────────────┐    1..N        ┌────────────────┐
                │  Product   │◄──────────────▶│     Bottle     │
                │   (SKU)    │   product_id   │  (instance)    │
                └────────────┘                └────────────────┘
                                                       │
                                                       │ 1..N
                                                       ▼
                                              ┌────────────────┐
                                              │    Reading     │
                                              │ (append-only)  │
                                              └────────────────┘
```

| Layer | What it is | Lifetime | Example |
|---|---|---|---|
| **Product** | The SKU — a purchasable item. Catalog metadata: name, category, ABV, density, flavor tags. | Persistent. You add it once and reference it forever. | "Buffalo Trace" · "Planteray 3 Star" · "Planteray OFTD" · "Carpano Antica Formula" |
| **Bottle** | A physical instance of a product you currently own. Has a level, a status (sealed/open/empty/archived), a tare weight, an optional sensor-channel binding. | Replaced on consumption. Buy a new one → new bottle row. The old bottle moves through `open → empty → archived` (or just stays `empty`). | "the Buffalo Trace bottle on shelf 3 with 600 mL left" |
| **Reading** | An append-only sensing event. Either a weight reading from a sensor, a manual ml entry, or a depletion stamped by a pour. | Forever. Never updated, never deleted (the trigger enforces this). | `{bottle_id: …, level_ml: 612, source: 'weight', ts: …}` |
| **Pour** | An operator commit: "I made this drink." Bundles bindings (which bottle, how many ml). | Forever. Recipe link can go null (recipe deleted) but bindings persist. | `{recipe: 'old-fashioned', bindings: [{bottle: …, ml: 60}, …]}` |

### Confirming the user's mental model

> *"Every product should really only have one bottle (or a single bottle with a qty >=1) but not multiple?"*

**Almost — the answer is "usually one, occasionally more."** The cardinality is `1 product → 0..N bottles`, where the common case is `0..1` (you own zero or one of any given SKU) but the model deliberately allows more. Three real cases where N > 1:

1. **Backup bottle** — you bought a spare of your daily Buffalo Trace. Two bottles, same product: one open, one sealed. The makeability engine treats them as a pool; the pour code picks the most-depleted-that-has-enough.
2. **Same SKU on two shelves** — one is your back-bar workhorse, the other lives in the kitchen for cooking. Different slots, different sensor channels, same product.
3. **Vintage variation, same SKU** — your Carpano Antica is going through bottle 4. The empties stay in the DB as historical record for pour analytics; only the open one is `status=open`.

> *"Planteray 3 Star and Planteray OFTD are separate products and bottles."*

Correct. They're different SKUs → different products. Each gets its own physical bottle(s).

### Why not collapse them?

A "qty on hand" field on Product would seem simpler — but it loses:
- Per-bottle tare (each physical bottle has a slightly different empty weight, even same SKU)
- Per-bottle slot/sensor binding (you can't weight-track a count)
- Per-bottle status (open vs sealed matters for FIFO use)
- Historical pour analytics that need to attribute draws to a specific bottle

The product/bottle split is the same one a real bar back uses: "we're out of Carpano" is a product-level statement; "the open Carpano on slot 3 has ~200 mL" is a bottle-level fact.

---

## 2. Current categorization

Products today carry the following structured fields (`data-model.md` §1):

```ts
Product = {
  id:           "buffalo-trace",          // slug
  name:         "Buffalo Trace",
  category:     "bourbon",                 // controlled-ish; seed uses canonical strings
  subcategory:  "kentucky-straight",       // free-text refinement
  abv:          0.45,
  density_g_ml: null,                      // null → category default
  default_ml:   750,
  flavor_tags:  ["smoky", "vanilla"],      // freeform array
  notes:        "..."
}
```

Recipes reference these three different ways (`data-model.md` §recipe_ingredient):

```ts
{ ref_type: "product",  ref_id: "buffalo-trace"  }   // exact bottle
{ ref_type: "category", ref_id: "bourbon"        }   // any bourbon
{ ref_type: "tag",      ref_id: "sweet-vermouth" }   // matches flavor_tags
{ ref_type: "freeform", ref_id: "orange peel"    }   // garnish, no bottle draw
```

The `flavor_tags` field already absorbs a fair amount of structured data without schema changes — every tag is a string, so you can write `["smuggler-cove:column-still-rum", "origin:barbados", "distillery:foursquare"]` today. It just isn't typed or indexed.

---

## 3. Proposal — richer structured metadata

The operator's wishlist (distillery, origin, Smuggler's Cove rum class, Cocktail Codex spec type) splits cleanly into **two kinds of metadata**, and each wants a different data shape:

### 3a. First-class structured fields — for things you'll filter/group by often

Add nullable columns on `product` for axes that are common enough to deserve typed access:

```sql
ALTER TABLE product ADD COLUMN distillery       TEXT;        -- "Foursquare", "Buffalo Trace Distillery"
ALTER TABLE product ADD COLUMN origin_country   TEXT;        -- ISO-3166-1 alpha-2: "US", "BB", "MX"
ALTER TABLE product ADD COLUMN origin_region    TEXT;        -- "Kentucky", "Barbados", "Oaxaca"
ALTER TABLE product ADD COLUMN producer_url     TEXT;        -- canonical link, optional
ALTER TABLE product ADD COLUMN age_statement_y  REAL;        -- "12" for 12-year-old; null when NAS
```

These earn columns because:
- Every operator wants "show me all Barbadian rums" or "all bourbons from Buffalo Trace Distillery"
- The values are short, low-cardinality, and worth indexing
- They render cleanly in the Catalog table as additional columns

### 3b. Tag namespace — for taxonomies that are framework-specific

Add a `product_tag` join table. Tags are namespaced (`namespace:value`) so multiple frameworks coexist without colliding:

```sql
CREATE TABLE product_tag (
  product_id TEXT NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  namespace  TEXT NOT NULL,                         -- "smugglers-cove" | "cocktail-codex" | "operator" | ...
  value      TEXT NOT NULL,                         -- "column-still-rum" | "old-fashioned-root" | "house-favorite"
  PRIMARY KEY (product_id, namespace, value)
);
CREATE INDEX ix_product_tag_ns_val ON product_tag(namespace, value);
```

Example rows:

| product_id | namespace | value |
|---|---|---|
| `planteray-3-star` | `smugglers-cove` | `column-still-rum` |
| `planteray-3-star` | `smugglers-cove` | `white-light-rum` |
| `planteray-oftd` | `smugglers-cove` | `blended-overproof-rum` |
| `planteray-oftd` | `smugglers-cove` | `pot-still-rum` |
| `rittenhouse-rye` | `cocktail-codex` | `old-fashioned-root` |
| `rittenhouse-rye` | `cocktail-codex` | `manhattan-root` |
| `buffalo-trace` | `operator` | `daily-workhorse` |

Then recipe ingredient refs gain a fifth `ref_type`:

```ts
{ ref_type: "tag", ref_id: "smugglers-cove:column-still-rum" }   // already supported
                                                                  //   matcher just looks at product_tag
```

(The current `tag` ref_type already exists — this proposal just gives it a real backing table instead of relying on the freeform `flavor_tags` array. Existing `flavor_tags` rows can migrate forward to namespace `flavor` with no recipe changes.)

### 3c. What this enables

- **Smuggler's Cove rum styles** — group rums by Burr/Lawson's 9 categories; filter Bottle Wall by "show me all my pot still rums"
- **Cocktail Codex roots** — group spirits by their codex-root recipe (Old Fashioned / Manhattan / Daiquiri / etc.); "what's the canonical Old Fashioned with each of my bourbons?"
- **Distillery clustering** — "show me everything from Foursquare" (especially valuable for rum where the bottling line ≠ the distillery)
- **Origin maps** — Bottle Wall could ribbon by country/region
- **Operator-defined sets** — house-favorite, batch-tested, gift-bottle-don't-touch — no schema change, just new namespaces

### 3d. UI implications

- Catalog gains a filter strip (above the table) for the namespaces you actually use
- Bottle Detail overlay surfaces tags as chips, grouped by namespace
- Product create/edit form adds optional fields for §3a + a free-form tag entry for §3b
- Recipes that reference `tag:smugglers-cove:column-still-rum` get a richer makeability "satisfied by N products" tooltip

---

## 4. Migration sketch

Phasing this without breaking existing data:

1. **Migration `0003_product_metadata.sql`** — adds the §3a columns (all nullable, no defaults change).
2. **Migration `0004_product_tag.sql`** — creates `product_tag` table + indexes.
3. **Backfill script** (`packages/db/scripts/backfill-tags.ts`, optional one-shot) — walks `product.flavor_tags`, splits anything that looks like `namespace:value`, and writes to `product_tag`. Untouched bare tags stay in `flavor_tags`. Idempotent.
4. **Makeability** (`packages/core/src/makeability.ts`) — extend the `tag` matcher to check `product_tag` first, then fall back to `flavor_tags`. No recipe migration needed; tags that resolve in either place keep working.
5. **UI** — Catalog form fields, Bottle Detail chips, optional Catalog tag-filter.

`flavor_tags` doesn't go away — it stays as the freeform "operator notes" tag bucket for things that don't deserve a namespace (e.g. "favorite", "needs-tasting"). The `product_tag` table is for structured taxonomies.

---

## 5. Open questions for the operator

Before implementing §3, decisions to make:

- **Which namespaces ship as built-ins?** Suggest: `smugglers-cove`, `cocktail-codex`, `flavor` (migrated from `flavor_tags`), `operator` (your own).
- **Which §3a columns are worth a typed field vs leaving as a tag?** `distillery` + `origin_country` are slam-dunks (used by serious operators); `age_statement_y` is a maybe (sparse, valued by some, ignored by most).
- **Should the tag matcher accept multiple tags as AND or OR?** Suggest OR (any matching product satisfies the ingredient), with explicit `tag:a+b` syntax for AND if it ever matters.
- **Seed coverage** — the layer-1 starter catalog (21 products) can be tagged in one PR. Larger catalog augmentation is a fill-as-you-go operator task.

If you green-light §3a alone, the migration is a one-evening change. §3b is another evening including the UI surface. Both are additive — nothing existing breaks.
