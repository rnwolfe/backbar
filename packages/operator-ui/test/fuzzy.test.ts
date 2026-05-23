import { describe, expect, it } from "bun:test";
import { fuzzyScore, rank } from "../src/palette/fuzzy";

describe("fuzzyScore", () => {
  it("returns 0 for empty query", () => {
    expect(fuzzyScore("anything", "")).toBe(0);
  });

  it("returns null when letters cannot be found in order", () => {
    expect(fuzzyScore("daiquiri", "xyz")).toBeNull();
    expect(fuzzyScore("daiquiri", "ird")).toBeNull(); // wrong order
  });

  it("matches subsequences and prefers word boundaries", () => {
    // "old fashioned" matches 'of' at two word starts ('o' in "old", 'f' in "fashioned").
    // "stove-flue" also matches 'of' but the 'o' is mid-word — should score lower.
    const a = fuzzyScore("old fashioned", "of");
    const b = fuzzyScore("stove-flue", "of");
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!).toBeGreaterThan(b!);
  });

  it("rewards earlier matches", () => {
    const a = fuzzyScore("negroni", "ne");
    const b = fuzzyScore("vermouth negroni", "ne");
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!).toBeGreaterThan(b!);
  });
});

describe("rank", () => {
  it("filters non-matches and sorts by score", () => {
    const items = ["Old Fashioned", "Manhattan", "Daiquiri", "Negroni"];
    const ranked = rank(items, "neg", (s) => s);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.item).toBe("Negroni");
  });

  it("ranks across multiple key fields", () => {
    const items = [
      { name: "Beefeater", id: "beefeater-london-dry", tags: ["juniper", "citrus"] },
      { name: "Tanqueray", id: "tanqueray", tags: ["juniper"] },
    ];
    const ranked = rank(items, "tanq", (i) => [i.name, i.id, ...i.tags]);
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0]!.item.name).toBe("Tanqueray");
  });

  it("returns all items unsorted for empty query", () => {
    const items = ["c", "a", "b"];
    const ranked = rank(items, "", (s) => s);
    expect(ranked.map((r) => r.item)).toEqual(["c", "a", "b"]);
  });
});
