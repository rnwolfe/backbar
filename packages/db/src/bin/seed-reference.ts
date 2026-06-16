#!/usr/bin/env bun
/**
 * Apply reference / managed content only (canon catalog + flavor corpus) —
 * idempotent and live-safe. This is what `backbar deploy` runs so corpus/canon
 * updates ship with each release without touching operator inventory/history.
 * For the full starter bar (bottles + synthetic history) use `db seed`.
 */
import { open } from "../client";
import { migrate } from "../migrations";
import { seedReference } from "../seed";

const db = open();
migrate(db);
const r = seedReference(db);
const row = (label: string, c: { inserted: number; skipped: number }) =>
  `[seed:reference] ${label.padEnd(10)} +${c.inserted} new, ${c.skipped} present`;
console.log(row("categories", r.categories));
console.log(row("products", r.products));
console.log(row("recipes", r.recipes));
console.log(
  `[seed:reference] flavor corpus: ${r.flavor.profiles} profiles, ${r.flavor.root_templates} roots, ` +
    `${r.flavor.substitutes} substitutes, ${r.flavor.cooccurrence_edges} co-occurrence + ` +
    `${r.flavor.molecular_edges} molecular edges`,
);
db.close();
