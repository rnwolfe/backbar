#!/usr/bin/env bun
import { open } from "../client";
import { migrate } from "../migrations";
import { seed } from "../seed";

const db = open();
migrate(db);
const report = seed(db);
const row = (label: string, c: { inserted: number; skipped: number }) =>
  `[seed] ${label.padEnd(10)} +${c.inserted} new, ${c.skipped} already present`;
console.log(row("products", report.products));
console.log(row("bottles", report.bottles));
console.log(row("recipes", report.recipes));
console.log(
  `[seed] category densities loaded (${Object.keys(report.densities).length} entries from spec §6):`,
);
for (const [category, d] of Object.entries(report.densities)) {
  console.log(`         ${category.padEnd(16)} ${d}`);
}
db.close();
