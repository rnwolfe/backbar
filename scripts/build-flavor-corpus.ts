#!/usr/bin/env bun
/**
 * Build the external flavor corpora (specs/ai-grounding-corpus.md, build pipeline).
 *
 * Currently ingests corpus B — the Ahn 2011 molecular flavor network (CC BY) —
 * normalizes it to our ingredient vocabulary, and writes a small committed
 * `packages/db/seed/flavor/molecular.json` that `seedFlavor` applies as the
 * (exploratory) molecular pairing signal. Co-occurrence (corpus C) is derived
 * at seed time from the recipe corpus, so it isn't rebuilt here.
 *
 * Data source resolution: a local extract at `$FPN_DIR` or `/tmp/fpn/ingr_comp`,
 * else downloads the Zenodo zip (record 11449658) and extracts via `unzip`.
 *
 * Attribution: Ahn, Ahnert, Bagrow & Barabási (2011), "Flavor network and the
 * principles of food pairing", Sci. Rep. 1:196 (CC BY 4.0); compound source
 * Fenaroli's Handbook of Flavor Ingredients. IBA canon (rasmusab/iba-cocktails,
 * MIT) and bar-assistant substitutes (MIT) ingestion are documented follow-ups.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const OUT = join(ROOT, "packages/db/seed/flavor/molecular.json");
const ZENODO = "https://zenodo.org/records/11449658/files/flavor_network_data.zip?download=1";

/**
 * Normalization crosswalk (corpus J): our ref → Ahn ingredient name. Hand-built;
 * many bar ingredients (vodka, vermouth, absinthe, amari) have no Ahn entry and
 * are intentionally absent — molecular coverage degrades gracefully. Several of
 * our refs share one Ahn source (rum sub-styles → "rum"); same-source pairs are
 * skipped (self-overlap isn't a meaningful pairing).
 */
const CROSSWALK: Record<string, string> = {
  gin: "gin",
  bourbon: "whiskey",
  rye: "whiskey",
  scotch: "whiskey",
  rum: "rum",
  "white-rum": "rum",
  "aged-rum": "rum",
  "jamaican-rum": "rum",
  "blackstrap-rum": "rum",
  tequila: "tequila",
  "blanco-tequila": "tequila",
  brandy: "brandy",
  lime: "lime_juice",
  "lime-juice": "lime_juice",
  lemon: "lemon_juice",
  "lemon-juice": "lemon_juice",
  grapefruit: "grapefruit",
  pineapple: "pineapple",
  "pineapple-juice": "pineapple",
  mint: "mint",
  wine: "wine",
  orgeat: "almond",
};

function log(msg: string) {
  console.log(`[flavor-corpus] ${msg}`);
}

function resolveDataDir(): string {
  const candidates = [process.env.FPN_DIR, "/tmp/fpn/ingr_comp"].filter(Boolean) as string[];
  for (const dir of candidates) {
    if (existsSync(join(dir, "ingr_info.tsv")) && existsSync(join(dir, "ingr_comp.tsv"))) return dir;
  }
  return downloadAhn();
}

function downloadAhn(): string {
  const tmp = "/tmp/fpn";
  log(`local extract not found — downloading Ahn dataset from Zenodo…`);
  mkdirSync(tmp, { recursive: true });
  const zip = join(tmp, "data.zip");
  const r = Bun.spawnSync(["curl", "-fsSL", "-o", zip, ZENODO]);
  if (!r.success) throw new Error("download failed — set FPN_DIR to a local extract");
  const u = Bun.spawnSync(["unzip", "-o", zip, "-d", tmp]);
  if (!u.success) throw new Error("unzip failed — extract data.zip manually and set FPN_DIR");
  const dir = join(tmp, "ingr_comp");
  if (!existsSync(join(dir, "ingr_info.tsv"))) throw new Error(`expected ${dir}/ingr_info.tsv`);
  return dir;
}

/** Parse a tab-separated file, dropping `#` comment lines. */
function rows(path: string): string[][] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split("\t"));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function main() {
  const dir = resolveDataDir();
  log(`data dir: ${dir}`);

  // name → ingredient id
  const nameToId = new Map<string, string>();
  for (const [id, name] of rows(join(dir, "ingr_info.tsv"))) {
    if (id && name) nameToId.set(name, id);
  }
  // ingredient id → compound set
  const compounds = new Map<string, Set<string>>();
  for (const [ingId, compId] of rows(join(dir, "ingr_comp.tsv"))) {
    if (!ingId || !compId) continue;
    (compounds.get(ingId) ?? compounds.set(ingId, new Set()).get(ingId)!).add(compId);
  }

  // Resolve our refs → compound sets via the crosswalk.
  const refCompounds = new Map<string, { ahn: string; comps: Set<string> }>();
  const unresolved: string[] = [];
  for (const [ref, ahnName] of Object.entries(CROSSWALK)) {
    const id = nameToId.get(ahnName);
    const comps = id ? compounds.get(id) : undefined;
    if (comps && comps.size) refCompounds.set(ref, { ahn: ahnName, comps });
    else unresolved.push(`${ref}→${ahnName}`);
  }

  // Pairwise molecular Jaccard, skipping same-Ahn-source pairs.
  const refs = [...refCompounds.keys()].sort();
  const edges: { a: string; b: string; molecular: number }[] = [];
  for (let i = 0; i < refs.length; i += 1) {
    for (let j = i + 1; j < refs.length; j += 1) {
      const ra = refCompounds.get(refs[i]!)!;
      const rb = refCompounds.get(refs[j]!)!;
      if (ra.ahn === rb.ahn) continue;
      const score = jaccard(ra.comps, rb.comps);
      if (score > 0) edges.push({ a: refs[i]!, b: refs[j]!, molecular: Number(score.toFixed(4)) });
    }
  }
  edges.sort((x, y) => y.molecular - x.molecular);

  writeFileSync(
    OUT,
    `${JSON.stringify(
      {
        _source: "Ahn et al. 2011 flavor network (CC BY 4.0), Zenodo 11449658",
        _note: "Exploratory molecular pairing — shared aroma-compound Jaccard. See specs/ai-grounding-corpus.md §B.",
        edges,
      },
      null,
      2,
    )}\n`,
  );

  log(`resolved ${refCompounds.size}/${Object.keys(CROSSWALK).length} refs; ${unresolved.length} unresolved`);
  if (unresolved.length) log(`unresolved (no Ahn entry): ${unresolved.join(", ")}`);
  log(`wrote ${edges.length} molecular edges → ${OUT}`);
  log(`top: ${edges.slice(0, 5).map((e) => `${e.a}~${e.b}=${e.molecular}`).join(", ")}`);
}

main();
