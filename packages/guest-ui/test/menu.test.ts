import { describe, expect, it } from "bun:test";
import { filterItems, groupBySection, sectionFor, visible, withAvailability } from "../src/menu";
import type { RenderedItem } from "../src/types";

const item = (over: Partial<RenderedItem> = {}): RenderedItem => ({
  name: "Daiquiri",
  family: "daiquiri",
  glass: "coupe",
  ice: "none",
  garnish: "lime",
  instructions: "Shake hard with plenty of ice. Double strain.",
  tags: ["citrus", "shaken"],
  available: true,
  ...over,
});

describe("sectionFor", () => {
  it("maps known families to editorial section labels", () => {
    expect(sectionFor("daiquiri")).toBe("Bright & Sour");
    expect(sectionFor("highball")).toBe("Long & Refreshing");
    expect(sectionFor("old-fashioned")).toBe("Stirred & Spirit-Forward");
    expect(sectionFor("tiki")).toBe("Tropical & Tiki");
  });

  it("falls back to House Originals when family is null", () => {
    expect(sectionFor(null)).toBe("House Originals");
    expect(sectionFor(undefined)).toBe("House Originals");
  });

  it("routes unknown families into Off-menu rather than dropping them", () => {
    expect(sectionFor("punch")).toBe("Off-menu");
  });
});

describe("groupBySection", () => {
  it("groups items, preserves canonical section order, and sorts by name", () => {
    const items = [
      item({ name: "Margarita", family: "sour" }),
      item({ name: "Whiskey Sour", family: "sour" }),
      item({ name: "Old Fashioned", family: "old-fashioned" }),
      item({ name: "Negroni", family: "stirred" }),
    ];
    const sections = groupBySection(items);
    expect(sections.map((s) => s.title)).toEqual([
      "Stirred & Spirit-Forward",
      "Bright & Sour",
    ]);
    expect(sections[1]!.items.map((i) => i.name)).toEqual(["Margarita", "Whiskey Sour"]);
  });

  it("returns empty sections array when no items", () => {
    expect(groupBySection([])).toEqual([]);
  });
});

describe("filterItems", () => {
  const items = [
    item({ name: "Daiquiri", tags: ["citrus"] }),
    item({ name: "Manhattan", family: "manhattan", tags: ["stirred"] }),
    item({ name: "Espresso Martini", family: "martini", tags: ["coffee"] }),
  ];

  it("returns everything for an empty query", () => {
    expect(filterItems(items, "")).toHaveLength(3);
    expect(filterItems(items, "   ")).toHaveLength(3);
  });

  it("matches by name (case-insensitive)", () => {
    expect(filterItems(items, "DAIQ").map((i) => i.name)).toEqual(["Daiquiri"]);
  });

  it("matches by family", () => {
    expect(filterItems(items, "manhattan").map((i) => i.name)).toEqual(["Manhattan"]);
  });

  it("matches by tag", () => {
    expect(filterItems(items, "coffee").map((i) => i.name)).toEqual(["Espresso Martini"]);
  });
});

describe("withAvailability + visible", () => {
  it("defaults snapshot items to available", () => {
    const out = withAvailability([
      { name: "X", family: null, glass: null, ice: null, garnish: null, instructions: null, tags: [] },
    ]);
    expect(out[0]!.available).toBe(true);
  });

  it("respects an explicit available=false in live mode payloads", () => {
    const out = withAvailability([
      {
        name: "X",
        family: null,
        glass: null,
        ice: null,
        garnish: null,
        instructions: null,
        tags: [],
        available: false,
      },
    ]);
    expect(out[0]!.available).toBe(false);
  });

  it("visible drops unavailable items unless showUnavailable=true", () => {
    const items = [item({ name: "A" }), item({ name: "B", available: false })];
    expect(visible(items, false).map((i) => i.name)).toEqual(["A"]);
    expect(visible(items, true).map((i) => i.name)).toEqual(["A", "B"]);
  });
});
