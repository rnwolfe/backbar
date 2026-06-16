import { DENSITY_BY_CATEGORY } from "@backbar/core";
import type { DB } from "./client";
import { uuidv7 } from "./ids";
import {
  bottles,
  categories,
  nodes,
  pours,
  productTags,
  products,
  readings,
  recipes,
  sensorChannels,
} from "./repositories";
import { STARTER_BOTTLES } from "../seed/bottles";
import { STARTER_CATEGORIES } from "../seed/categories";
import { CANON_PRODUCTS } from "../seed/products";
import { CANON_RECIPES } from "../seed/canon";
import { channelLayoutFor, nodesAtNow, STARTER_NODES } from "../seed/nodes";
import {
  asPourRow,
  generateLevelHistory,
  generatePourHistory,
  RECIPE_BINDINGS,
} from "../seed/history";
import { seedFlavor, type FlavorSeedReport } from "./seedFlavor";

// Re-export so consumers of @backbar/db can read defaults without
// importing @backbar/core directly (spec §6 — category density defaults).
export { DENSITY_BY_CATEGORY } from "@backbar/core";
export { CANON_RECIPES } from "../seed/canon";
export { CANON_PRODUCTS } from "../seed/products";
export type { StarterProduct } from "../seed/products";
export { STARTER_BOTTLES } from "../seed/bottles";
export { STARTER_CATEGORIES } from "../seed/categories";
export type { StarterCategory } from "../seed/categories";
export { STARTER_NODES } from "../seed/nodes";

interface InsertCounts {
  inserted: number;
  skipped: number;
}

/**
 * Managed content that ships with the app and is **safe to re-apply on every
 * deploy** — idempotent (skip-existing for catalog rows, upsert for the flavor
 * corpus), never touches operator inventory or history.
 */
export interface ReferenceReport {
  categories: InsertCounts;
  products: InsertCounts;
  product_tags: InsertCounts;
  recipes: InsertCounts;
  flavor: FlavorSeedReport;
  densities: Record<string, number>;
}

/**
 * Bootstrap fixtures — the starter bar's bottles + synthetic history. **Run
 * once at bootstrap, never on a live deploy.** Guards make a re-run safe and
 * keep synthetic history off operator-added bottles, by two different means:
 * readings are backfilled only for bottles inserted *in this run*; pours are
 * seeded only when the pour table is empty, and the synthetic bindings only
 * reference starter bottles regardless.
 */
export interface FixturesReport {
  bottles: InsertCounts;
  nodes: InsertCounts;
  sensor_channels: InsertCounts;
  pours: InsertCounts;
  readings: InsertCounts;
}

export interface SeedReport extends ReferenceReport, FixturesReport {}

/**
 * Reference / managed content: categories, canon products + tags, canon
 * recipes, and the flavor corpus. **Idempotent and live-safe** — catalog rows
 * skip-if-exists (operator edits survive), the flavor corpus upserts. This is
 * the only seed step `backbar deploy` runs, so corpus/canon updates ship with
 * each release without ever touching operator inventory or history.
 */
export function seedReference(db: DB): ReferenceReport {
  const categoriesRepo = categories(db);
  const productsRepo = products(db);
  const productTagsRepo = productTags(db);
  const recipesRepo = recipes(db);

  // Categories — insert any starter rows that aren't already present. Idempotent;
  // operator edits (renamed labels, custom hues) survive a re-seed because we
  // skip rows whose id already exists.
  const categoryCounts: InsertCounts = { inserted: 0, skipped: 0 };
  for (const c of STARTER_CATEGORIES) {
    if (categoriesRepo.get(c.id)) {
      categoryCounts.skipped += 1;
    } else {
      categoriesRepo.insert(c);
      categoryCounts.inserted += 1;
    }
  }

  const productCounts: InsertCounts = { inserted: 0, skipped: 0 };
  // Tag insertion is idempotent (INSERT OR IGNORE on the composite PK), so
  // we can re-seed tags even on products that already existed — that lets
  // operators pick up new tags from the canon catalog after a backfill rerun
  // without having to wipe + reseed.
  const productTagCounts: InsertCounts = { inserted: 0, skipped: 0 };
  for (const p of CANON_PRODUCTS) {
    const { tags, ...productFields } = p;
    if (productsRepo.get(p.id)) {
      productCounts.skipped += 1;
    } else {
      productsRepo.insert(productFields);
      productCounts.inserted += 1;
    }
    if (tags) {
      const existingTags = new Set(
        productTagsRepo.forProduct(p.id).map((t) => `${t.namespace}/${t.value}`),
      );
      for (const t of tags) {
        const key = `${t.namespace}/${t.value}`;
        if (existingTags.has(key)) {
          productTagCounts.skipped += 1;
        } else {
          productTagsRepo.add({ product_id: p.id, ...t });
          productTagCounts.inserted += 1;
        }
      }
    }
  }

  const recipeCounts: InsertCounts = { inserted: 0, skipped: 0 };
  for (const r of CANON_RECIPES) {
    if (recipesRepo.get(r.id)) {
      recipeCounts.skipped += 1;
      continue;
    }
    recipesRepo.insert(r);
    recipeCounts.inserted += 1;
  }

  const flavor = seedFlavor(db);

  return {
    categories: categoryCounts,
    products: productCounts,
    product_tags: productTagCounts,
    recipes: recipeCounts,
    flavor,
    densities: { ...DENSITY_BY_CATEGORY },
  };
}

/**
 * Bootstrap fixtures: starter bottles, fleet nodes, sensor channels, and 28d of
 * synthetic pours/readings. **Bootstrap-only — `backbar deploy` never calls
 * this.** Every section guards against duplicates, and synthetic history stays
 * off operator-added bottles two ways: readings are backfilled only for bottles
 * inserted *in this run*; pours are seeded only when the pour table is empty,
 * and the synthetic bindings reference only starter bottles regardless. So a
 * live deploy or admin reseed can't fabricate history on an operator bottle.
 *
 * Requires the reference catalog to exist first (bottle → product FK).
 */
export function seedFixtures(db: DB): FixturesReport {
  const bottlesRepo = bottles(db);
  const recipesRepo = recipes(db);
  const nodesRepo = nodes(db);
  const channelsRepo = sensorChannels(db);
  const poursRepo = pours(db);
  const readingsRepo = readings(db);

  const bottleCounts: InsertCounts = { inserted: 0, skipped: 0 };
  const insertedBottleIds = new Set<string>();
  for (const b of STARTER_BOTTLES) {
    if (bottlesRepo.get(b.id)) {
      bottleCounts.skipped += 1;
      continue;
    }
    bottlesRepo.insert(b);
    insertedBottleIds.add(b.id);
    bottleCounts.inserted += 1;
  }

  // Nodes — upsert is safe to call repeatedly; we count "inserted" only when
  // the node didn't exist before.
  const existingNodes = new Set(nodesRepo.list().map((n) => n.device_id));
  const nodeCounts: InsertCounts = { inserted: 0, skipped: 0 };
  for (const n of nodesAtNow()) {
    if (existingNodes.has(n.device_id)) {
      nodeCounts.skipped += 1;
      continue;
    }
    nodesRepo.upsert(n);
    nodeCounts.inserted += 1;
  }

  // Sensor channels — wire whichever starter bottles actually got inserted.
  // After /admin/reset/bar the bottle_id cascade-nulls but the channel row
  // survives, so we re-upsert here to re-bind channels to the newly-seeded
  // bottles. `inserted` counts brand-new channels; `skipped` counts ones we
  // re-bound without changing the underlying row identity.
  const liveBottleIds = bottlesRepo.list().map((b) => b.id);
  const channelLayout = channelLayoutFor(liveBottleIds);
  const existingChannels = new Set(
    channelsRepo.list().map((ch) => `${ch.device_id}/${ch.channel}`),
  );
  const channelCounts: InsertCounts = { inserted: 0, skipped: 0 };
  for (const ch of channelLayout) {
    const key = `${ch.device_id}/${ch.channel}`;
    const isNew = !existingChannels.has(key);
    channelsRepo.upsert(ch);
    if (isNew) channelCounts.inserted += 1;
    else channelCounts.skipped += 1;
  }

  // Pours: only insert when the table is empty. We don't pile 28d on every reseed.
  const haveAnyPour = poursRepo.list(1).length > 0;
  const pourCounts: InsertCounts = { inserted: 0, skipped: 0 };
  if (haveAnyPour) {
    pourCounts.skipped = 1;
  } else {
    // Filter generator output to bottles that exist in DB; skip pours whose
    // bindings reference a missing bottle (handles partial seeds gracefully).
    const liveSet = new Set(liveBottleIds);
    const recipeIds = new Set(recipesRepo.list().map((r) => r.id));
    for (const ev of generatePourHistory()) {
      if (!recipeIds.has(ev.recipe_id)) continue;
      const valid = ev.bindings.every((b) => liveSet.has(b.bottle_id));
      if (!valid) continue;
      poursRepo.insert(asPourRow(ev, uuidv7));
      pourCounts.inserted += 1;
    }
    void RECIPE_BINDINGS; // referenced for IDE go-to-def from this module
  }

  // Readings — 14 per bottle, but ONLY for bottles inserted in this run. This
  // is the live-safety guarantee: an operator-added bottle (not in the starter
  // set) is never backfilled with synthetic history.
  const readingCounts: InsertCounts = { inserted: 0, skipped: 0 };
  const bottlesNeedingReadings = bottlesRepo
    .list()
    .filter((b) => insertedBottleIds.has(b.id) && readingsRepo.forBottle(b.id, 1).length === 0)
    .map((b) => ({ id: b.id, full_ml: b.full_ml, level_ml: b.level_ml }));
  const readings14 = generateLevelHistory(bottlesNeedingReadings, uuidv7);
  for (const r of readings14) {
    readingsRepo.insert(r);
    readingCounts.inserted += 1;
  }
  readingCounts.skipped = bottlesRepo.list().length - bottlesNeedingReadings.length;

  return {
    bottles: bottleCounts,
    nodes: nodeCounts,
    sensor_channels: channelCounts,
    pours: pourCounts,
    readings: readingCounts,
  };
}

/**
 * Full bootstrap: reference content + starter fixtures. Used by `db seed` and
 * the admin `/reseed` endpoint. A live deploy uses {@link seedReference} only.
 *
 * Order matters: reference first (products before bottles for the FK), then
 * fixtures (bottles before channels/pours/readings).
 */
export function seed(db: DB): SeedReport {
  const reference = seedReference(db);
  const fixtures = seedFixtures(db);
  return { ...reference, ...fixtures };
}
