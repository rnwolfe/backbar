import { describe, expect, test } from "bun:test";
import { groundBottle, groundBatch } from "../src/ai/ground-inventory";
import {
  type ExtractedBottle,
  GroundedBottle,
  InventoryGroundingResult,
} from "../src/ai/schema";

const dummyModel = { fake: true } as never;

const MAKERS_MARK: ExtractedBottle = {
  display_name: "Maker's Mark Bourbon Whisky",
  expression: null,
  fill_observed: "three-quarter",
  confidence: 0.95,
  brand: null,
  distillery: null,
  category: null,
  size_ml: null,
  abv: null,
};

const HENDRICKS_ORBIUM: ExtractedBottle = {
  display_name: "Hendrick's Gin",
  expression: "Orbium",
  fill_observed: "half",
  confidence: 0.88,
  brand: null,
  distillery: null,
  category: null,
  size_ml: null,
  abv: null,
};

const GROUNDING_MAKERS: InventoryGroundingResult = {
  brand: "Maker's Mark",
  distillery: "Maker's Mark Distillery",
  category: "bourbon",
  size_ml: 750,
  abv: 0.45,
  origin_country: "US",
  confidence: "high",
  rationale: "Well-known Kentucky straight bourbon.",
};

// ── Schema unit tests ─────────────────────────────────────────────────────

describe("InventoryGroundingResult schema", () => {
  test("accepts a fully-grounded result", () => {
    expect(InventoryGroundingResult.safeParse(GROUNDING_MAKERS).success).toBe(true);
  });

  test("accepts null for every nullable field", () => {
    const minimal = {
      brand: null,
      distillery: null,
      category: null,
      size_ml: null,
      abv: null,
      origin_country: null,
      confidence: "low",
      rationale: null,
    };
    expect(InventoryGroundingResult.safeParse(minimal).success).toBe(true);
  });

  test("rejects confidence outside enum", () => {
    const bad = { ...GROUNDING_MAKERS, confidence: "very-high" };
    expect(InventoryGroundingResult.safeParse(bad).success).toBe(false);
  });

  test("rejects abv > 1", () => {
    const bad = { ...GROUNDING_MAKERS, abv: 1.1 };
    expect(InventoryGroundingResult.safeParse(bad).success).toBe(false);
  });

  test("rejects origin_country not exactly 2 chars", () => {
    const bad = { ...GROUNDING_MAKERS, origin_country: "USA" };
    expect(InventoryGroundingResult.safeParse(bad).success).toBe(false);
  });
});

describe("GroundedBottle schema", () => {
  test("accepts a fully grounded bottle", () => {
    const bottle = {
      ...MAKERS_MARK,
      brand: GROUNDING_MAKERS.brand,
      distillery: GROUNDING_MAKERS.distillery,
      category: GROUNDING_MAKERS.category,
      size_ml: GROUNDING_MAKERS.size_ml,
      abv: GROUNDING_MAKERS.abv,
      origin_country: GROUNDING_MAKERS.origin_country,
      grounding_source: "anthropic/claude-haiku-4-5",
      grounding_confidence: "high",
      grounding_rationale: "Well-known Kentucky straight bourbon.",
    };
    expect(GroundedBottle.safeParse(bottle).success).toBe(true);
  });

  test("accepts a degraded bottle with all grounded fields null", () => {
    const bottle = {
      ...MAKERS_MARK,
      origin_country: null,
      grounding_source: null,
      grounding_confidence: null,
      grounding_rationale: null,
    };
    expect(GroundedBottle.safeParse(bottle).success).toBe(true);
  });
});

// ── groundBottle ─────────────────────────────────────────────────────────

describe("groundBottle", () => {
  test("fills grounded fields from model response", async () => {
    const result = await groundBottle(MAKERS_MARK, {
      model: dummyModel,
      sourceLabel: "test-model",
      generate: (async () => ({ object: GROUNDING_MAKERS })) as never,
    });

    expect(result.display_name).toBe("Maker's Mark Bourbon Whisky");
    expect(result.fill_observed).toBe("three-quarter");
    expect(result.confidence).toBe(0.95);

    expect(result.brand).toBe("Maker's Mark");
    expect(result.distillery).toBe("Maker's Mark Distillery");
    expect(result.category).toBe("bourbon");
    expect(result.size_ml).toBe(750);
    expect(result.abv).toBe(0.45);
    expect(result.origin_country).toBe("US");

    expect(result.grounding_source).toBe("test-model");
    expect(result.grounding_confidence).toBe("high");
    expect(result.grounding_rationale).toContain("bourbon");
  });

  test("includes expression in the grounding query (tested via prompt capture)", async () => {
    const capturedPrompts: string[] = [];
    await groundBottle(HENDRICKS_ORBIUM, {
      model: dummyModel,
      generate: (async (args: { prompt: string }) => {
        capturedPrompts.push(args.prompt);
        return { object: { ...GROUNDING_MAKERS, category: "gin" } };
      }) as never,
    });

    expect(capturedPrompts[0]).toContain("Hendrick's Gin");
    expect(capturedPrompts[0]).toContain("Orbium");
  });

  test("degrades gracefully when model returns null fields", async () => {
    const nullGrounding: InventoryGroundingResult = {
      brand: null,
      distillery: null,
      category: null,
      size_ml: null,
      abv: null,
      origin_country: null,
      confidence: "low",
      rationale: "Unknown product.",
    };

    const result = await groundBottle(MAKERS_MARK, {
      model: dummyModel,
      generate: (async () => ({ object: nullGrounding })) as never,
    });

    expect(result.brand).toBeNull();
    expect(result.category).toBeNull();
    expect(result.abv).toBeNull();
    expect(result.grounding_confidence).toBe("low");
    // Vision fields preserved
    expect(result.display_name).toBe("Maker's Mark Bourbon Whisky");
    expect(result.fill_observed).toBe("three-quarter");
  });

  test("degrades to null grounding when model is unavailable", async () => {
    const result = await groundBottle(MAKERS_MARK, {
      model: null,
    });

    expect(result.display_name).toBe("Maker's Mark Bourbon Whisky");
    expect(result.brand).toBeNull();
    expect(result.grounding_source).toBeNull();
    expect(result.grounding_confidence).toBeNull();
  });

  test("degrades gracefully when generate throws", async () => {
    const result = await groundBottle(MAKERS_MARK, {
      model: dummyModel,
      generate: (async () => {
        throw new Error("network error");
      }) as never,
    });

    expect(result.display_name).toBe("Maker's Mark Bourbon Whisky");
    expect(result.brand).toBeNull();
    expect(result.grounding_source).toBeNull();
    expect(result.grounding_confidence).toBeNull();
  });
});

// ── groundBatch ───────────────────────────────────────────────────────────

describe("groundBatch", () => {
  test("grounds all candidates in parallel, returns one result per input", async () => {
    const results = await groundBatch([MAKERS_MARK, HENDRICKS_ORBIUM], {
      model: dummyModel,
      generate: (async () => ({ object: GROUNDING_MAKERS })) as never,
    });

    expect(results).toHaveLength(2);
    expect(results[0]?.display_name).toBe("Maker's Mark Bourbon Whisky");
    expect(results[1]?.display_name).toBe("Hendrick's Gin");
  });

  test("one failure degrades that item, rest succeed", async () => {
    let calls = 0;
    const results = await groundBatch([MAKERS_MARK, HENDRICKS_ORBIUM], {
      model: dummyModel,
      generate: (async () => {
        calls++;
        if (calls === 2) throw new Error("lookup failed");
        return { object: GROUNDING_MAKERS };
      }) as never,
    });

    expect(results).toHaveLength(2);
    // First succeeded
    expect(results[0]?.brand).toBe("Maker's Mark");
    expect(results[0]?.grounding_source).toBeDefined();
    // Second degraded
    expect(results[1]?.brand).toBeNull();
    expect(results[1]?.grounding_source).toBeNull();
    // Vision fields preserved on degraded item
    expect(results[1]?.display_name).toBe("Hendrick's Gin");
    expect(results[1]?.fill_observed).toBe("half");
  });

  test("handles empty input", async () => {
    const results = await groundBatch([], {});
    expect(results).toHaveLength(0);
  });
});
