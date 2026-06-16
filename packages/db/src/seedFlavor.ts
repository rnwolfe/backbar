import { ROOT_TEMPLATES, type Recipe } from "@backbar/core";
import type { DB } from "./client";
import { flavorPairings, flavorProfiles, ingredientSubstitutes, rootTemplates } from "./repositories";
import { CANON_RECIPES } from "../seed/canon";
import { FLAVOR_PROFILES } from "../seed/flavor/profiles";
import { SUBSTITUTES } from "../seed/flavor/substitutes";
import MOLECULAR from "../seed/flavor/molecular.json";

export interface FlavorSeedReport {
  profiles: number;
  root_templates: number;
  substitutes: number;
  cooccurrence_edges: number;
  molecular_edges: number;
}

interface MolecularFile {
  edges: { a: string; b: string; molecular: number }[];
}

/**
 * Derive co-occurrence pairing (corpus C) from a recipe corpus: count how often
 * two ingredient refs share a recipe, normalize by the most common pair.
 * Freeform garnish/pantry refs are excluded. Returns `a<=b` keyed scores 0..1.
 */
export function deriveCooccurrence(recipes: readonly Recipe[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of recipes) {
    const refs = Array.from(
      new Set(
        r.ingredients
          .filter((i) => i.ref_type !== "freeform" && i.ref_id)
          .map((i) => i.ref_id as string),
      ),
    );
    for (let i = 0; i < refs.length; i += 1) {
      for (let j = i + 1; j < refs.length; j += 1) {
        const [a, b] = refs[i]! <= refs[j]! ? [refs[i]!, refs[j]!] : [refs[j]!, refs[i]!];
        const key = `${a}|${b}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  const max = Math.max(1, ...counts.values());
  const scores = new Map<string, number>();
  for (const [key, c] of counts) scores.set(key, c / max);
  return scores;
}

/**
 * Seed the flavor-grounding corpus: profiles (A), root templates (F),
 * substitutions (E), and co-occurrence pairing (C) derived from the canon.
 * Molecular pairing (B) is populated separately by scripts/build-flavor-corpus.ts.
 * Idempotent — upserts everywhere.
 */
export function seedFlavor(db: DB, recipes: readonly Recipe[] = CANON_RECIPES): FlavorSeedReport {
  const profilesRepo = flavorProfiles(db);
  const templatesRepo = rootTemplates(db);
  const subsRepo = ingredientSubstitutes(db);
  const pairingsRepo = flavorPairings(db);

  for (const p of FLAVOR_PROFILES) profilesRepo.upsert(p);
  for (const t of ROOT_TEMPLATES) templatesRepo.upsert(t);

  let subs = 0;
  for (const s of SUBSTITUTES) {
    subsRepo.add({ ref: s.ref, substitute_ref: s.substitute_ref, note: s.note });
    subs += 1;
    if (s.bidirectional) {
      subsRepo.add({ ref: s.substitute_ref, substitute_ref: s.ref, note: s.note });
      subs += 1;
    }
  }

  const cooc = deriveCooccurrence(recipes);
  for (const [key, score] of cooc) {
    const [a, b] = key.split("|") as [string, string];
    pairingsRepo.setCooccurrence(a, b, score);
  }

  // Molecular pairing (corpus B) — built offline by scripts/build-flavor-corpus.ts.
  const molecular = (MOLECULAR as MolecularFile).edges ?? [];
  for (const e of molecular) pairingsRepo.setMolecular(e.a, e.b, e.molecular);

  return {
    profiles: FLAVOR_PROFILES.length,
    root_templates: ROOT_TEMPLATES.length,
    substitutes: subs,
    cooccurrence_edges: cooc.size,
    molecular_edges: molecular.length,
  };
}
