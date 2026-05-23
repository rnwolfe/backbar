import type { MenuItem, RenderedItem } from "./types";

/**
 * Editorial section labels per spec §3 — house framings, not literal `family`
 * strings. Anything outside this map falls into "Off-menu" so we never drop a
 * published item silently.
 */
const FAMILY_TO_SECTION: Record<string, string> = {
  "old-fashioned": "Stirred & Spirit-Forward",
  martini: "Stirred & Spirit-Forward",
  manhattan: "Stirred & Spirit-Forward",
  negroni: "Stirred & Spirit-Forward",
  stirred: "Stirred & Spirit-Forward",
  sour: "Bright & Sour",
  daiquiri: "Bright & Sour",
  sidecar: "Bright & Sour",
  highball: "Long & Refreshing",
  collins: "Long & Refreshing",
  spritz: "Long & Refreshing",
  tiki: "Tropical & Tiki",
  swizzle: "Tropical & Tiki",
  flip: "Rich & Egg-Forward",
  freeform: "House Originals",
};

const SECTION_ORDER = [
  "Stirred & Spirit-Forward",
  "Bright & Sour",
  "Long & Refreshing",
  "Tropical & Tiki",
  "Rich & Egg-Forward",
  "House Originals",
  "Off-menu",
];

export interface Section {
  title: string;
  items: RenderedItem[];
}

export function sectionFor(family: string | null | undefined): string {
  if (!family) return "House Originals";
  return FAMILY_TO_SECTION[family.toLowerCase()] ?? "Off-menu";
}

export function groupBySection(items: RenderedItem[]): Section[] {
  const map = new Map<string, RenderedItem[]>();
  for (const item of items) {
    const key = sectionFor(item.family);
    const bucket = map.get(key) ?? [];
    bucket.push(item);
    map.set(key, bucket);
  }
  // Stable section ordering; any unknown sections appended alphabetically.
  const known = SECTION_ORDER.filter((s) => map.has(s));
  const unknown = [...map.keys()].filter((k) => !SECTION_ORDER.includes(k)).sort();
  return [...known, ...unknown].map((title) => ({
    title,
    items: (map.get(title) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

/** Lightweight free-text filter — name, family, tags. No fuzzy ranking; this
 *  is the guest "search the menu" box, not the operator command palette. */
export function filterItems(items: RenderedItem[], query: string): RenderedItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((it) => {
    if (it.name.toLowerCase().includes(q)) return true;
    if (it.family && it.family.toLowerCase().includes(q)) return true;
    if (it.tags.some((t) => t.toLowerCase().includes(q))) return true;
    return false;
  });
}

/** In snapshot mode every item served is by definition makeable → available=true.
 *  In live mode the server response already carries `available`. */
export function withAvailability(items: Array<MenuItem & { available?: boolean }>): RenderedItem[] {
  return items.map((it) => ({ ...it, available: it.available ?? true }));
}

/** Live-mode hides unavailable items by default (a guest never sees "86'd").
 *  Spec §4 leaves either drop-off-the-menu OR muted treatment acceptable; we
 *  hide by default and expose `showUnavailable` so operators can flip during
 *  development without rebuilding. */
export function visible(items: RenderedItem[], showUnavailable: boolean): RenderedItem[] {
  return showUnavailable ? items : items.filter((it) => it.available);
}
