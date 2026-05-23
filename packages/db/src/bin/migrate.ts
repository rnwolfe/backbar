#!/usr/bin/env bun
import { open } from "../client";
import { appliedVersions, migrate } from "../migrations";

const db = open();
const ran = migrate(db);
const all = appliedVersions(db);

if (ran.length === 0) {
  console.log(`[migrate] up-to-date (${all.length} applied)`);
} else {
  console.log(`[migrate] applied: ${ran.join(", ")}`);
  console.log(`[migrate] total applied: ${all.length}`);
}
db.close();
