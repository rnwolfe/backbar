#!/usr/bin/env bun
import { open } from "../client";
import { migrate } from "../migrations";
import { seed } from "../seed";

const db = open();
migrate(db);
const report = seed(db);
console.log(
  `[seed] recipes: +${report.recipesInserted} new, ${report.recipesSkipped} already present`,
);
console.log(
  `[seed] category densities loaded (${Object.keys(report.densities).length} entries from spec §6):`,
);
for (const [category, d] of Object.entries(report.densities)) {
  console.log(`         ${category.padEnd(16)} ${d}`);
}
db.close();
