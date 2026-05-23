/**
 * Position-weighted subsequence scorer.
 *
 * - Requires every letter of `q` to appear in `haystack` in order.
 * - Earlier matches and matches at word boundaries score higher.
 * - Returns null for non-matches so callers can filter cheaply.
 *
 * At ~100 bottles + dozens of recipes + a handful of commands this stays
 * under a millisecond per keystroke; no need for FlexSearch / Fuse.
 */
export function fuzzyScore(haystack: string, q: string): number | null {
  if (!q) return 0;
  const h = haystack.toLowerCase();
  const n = q.toLowerCase();
  let hi = 0;
  let score = 0;
  let consecutive = 0;
  let firstMatch = -1;

  for (let qi = 0; qi < n.length; qi++) {
    const ch = n[qi]!;
    let found = -1;
    while (hi < h.length) {
      if (h[hi] === ch) {
        found = hi;
        break;
      }
      hi++;
    }
    if (found === -1) return null;
    if (firstMatch === -1) firstMatch = found;

    const prev = found > 0 ? h[found - 1]! : " ";
    const wordBoundary = prev === " " || prev === "-" || prev === "_" || prev === "/";
    score += wordBoundary ? 4 : 1;
    if (found === hi && hi > 0) consecutive += 1;
    else consecutive = 0;
    score += consecutive;
    hi = found + 1;
  }

  // Earlier first-match wins ties.
  score += Math.max(0, 10 - firstMatch);
  // Shorter haystacks beat long ones on equal score.
  score += Math.max(0, 12 - h.length / 4);
  return score;
}

export interface Ranked<T> {
  item: T;
  score: number;
}

export function rank<T>(
  items: T[],
  q: string,
  key: (t: T) => string | string[],
): Ranked<T>[] {
  if (!q) return items.map((item) => ({ item, score: 0 }));
  const out: Ranked<T>[] = [];
  for (const item of items) {
    const k = key(item);
    const fields = Array.isArray(k) ? k : [k];
    let best: number | null = null;
    for (const f of fields) {
      const s = fuzzyScore(f, q);
      if (s !== null && (best === null || s > best)) best = s;
    }
    if (best !== null) out.push({ item, score: best });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}
