import { describe, expect, test } from "bun:test";
import { importInventory } from "../src/ai/import-inventory";
import { ExtractedBottle, InventoryImportResult } from "../src/ai/schema";

const dummyModel = { fake: true } as never;

// Recorded sample response — represents what the vision model returns for a
// two-bottle bar photo. Grounding slots (brand, distillery, category, size_ml,
// abv) are null as the prompt instructs.
const SAMPLE_RESPONSE: InventoryImportResult = {
  bottles: [
    {
      display_name: "Maker's Mark Bourbon Whisky",
      expression: null,
      fill_observed: "three-quarter",
      confidence: 0.95,
      brand: null,
      distillery: null,
      category: null,
      size_ml: null,
      abv: null,
    },
    {
      display_name: "Hendrick's Gin",
      expression: "Orbium",
      fill_observed: "half",
      confidence: 0.88,
      brand: null,
      distillery: null,
      category: null,
      size_ml: null,
      abv: null,
    },
  ],
};

// ── Schema unit tests ─────────────────────────────────────────────────────

describe("ExtractedBottle schema", () => {
  test("accepts a fully valid bottle with all vision fields set", () => {
    const result = ExtractedBottle.safeParse(SAMPLE_RESPONSE.bottles[0]);
    expect(result.success).toBe(true);
  });

  test("grounding slots default to null when omitted", () => {
    const minimal = {
      display_name: "Bacardi Rum",
      expression: null,
      fill_observed: "full",
      confidence: 0.9,
    };
    const result = ExtractedBottle.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.brand).toBeNull();
      expect(result.data.distillery).toBeNull();
      expect(result.data.category).toBeNull();
      expect(result.data.size_ml).toBeNull();
      expect(result.data.abv).toBeNull();
    }
  });

  test("rejects missing display_name", () => {
    const invalid = { expression: null, fill_observed: "full", confidence: 0.9 };
    expect(ExtractedBottle.safeParse(invalid).success).toBe(false);
  });

  test("rejects confidence > 1", () => {
    const invalid = {
      display_name: "Rum",
      expression: null,
      fill_observed: null,
      confidence: 1.5,
    };
    expect(ExtractedBottle.safeParse(invalid).success).toBe(false);
  });

  test("rejects confidence < 0", () => {
    const invalid = {
      display_name: "Rum",
      expression: null,
      fill_observed: null,
      confidence: -0.1,
    };
    expect(ExtractedBottle.safeParse(invalid).success).toBe(false);
  });

  test("rejects invalid fill_observed value", () => {
    const invalid = {
      display_name: "Rum",
      expression: null,
      fill_observed: "mostly-full",
      confidence: 0.8,
    };
    expect(ExtractedBottle.safeParse(invalid).success).toBe(false);
  });

  test("accepts null fill_observed (level not visible)", () => {
    const result = ExtractedBottle.safeParse({
      display_name: "Bacardi Rum",
      expression: null,
      fill_observed: null,
      confidence: 0.85,
    });
    expect(result.success).toBe(true);
  });

  test("accepts expression when provided", () => {
    const result = ExtractedBottle.safeParse({
      display_name: "Glenfiddich Single Malt Scotch Whisky",
      expression: "12 Year",
      fill_observed: "quarter",
      confidence: 0.97,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.expression).toBe("12 Year");
  });
});

describe("InventoryImportResult schema", () => {
  test("validates sample response array", () => {
    const result = InventoryImportResult.safeParse(SAMPLE_RESPONSE);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.bottles).toHaveLength(2);
  });

  test("accepts empty bottles array (no bottles detected)", () => {
    expect(InventoryImportResult.safeParse({ bottles: [] }).success).toBe(true);
  });
});

// ── importInventory generate+repair loop ─────────────────────────────────

describe("importInventory", () => {
  test("happy path: validates sample model response, returns ok on first attempt", async () => {
    let calls = 0;
    const result = await importInventory(
      { image_b64: "AA==", media_type: "image/jpeg" },
      {
        model: dummyModel,
        generate: (async () => {
          calls++;
          return { object: SAMPLE_RESPONSE } as never;
        }) as never,
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.attempts).toBe(1);
      expect(result.bottles).toHaveLength(2);
      // Vision fields populated
      expect(result.bottles[0]?.display_name).toBe("Maker's Mark Bourbon Whisky");
      expect(result.bottles[0]?.fill_observed).toBe("three-quarter");
      expect(result.bottles[0]?.confidence).toBe(0.95);
      expect(result.bottles[1]?.expression).toBe("Orbium");
      // Grounding placeholders remain null (prompt says to leave them null)
      expect(result.bottles[0]?.brand).toBeNull();
      expect(result.bottles[0]?.distillery).toBeNull();
      expect(result.bottles[0]?.category).toBeNull();
      expect(result.bottles[0]?.size_ml).toBeNull();
      expect(result.bottles[0]?.abv).toBeNull();
    }
    expect(calls).toBe(1);
  });

  test("repair: first attempt throws, second succeeds → ok with attempts:2", async () => {
    let calls = 0;
    const result = await importInventory(
      { image_b64: "AA==", media_type: "image/jpeg" },
      {
        model: dummyModel,
        generate: (async () => {
          calls++;
          if (calls === 1) throw new Error("model output did not match schema");
          return { object: SAMPLE_RESPONSE } as never;
        }) as never,
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.attempts).toBe(2);
    expect(calls).toBe(2);
  });

  test("extract-failed after 2 attempts → ok:false with reason, never crashes", async () => {
    let calls = 0;
    const result = await importInventory(
      { image_b64: "AA==", media_type: "image/jpeg" },
      {
        model: dummyModel,
        generate: (async () => {
          calls++;
          throw new Error("model refused to generate");
        }) as never,
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("extract-failed");
      expect(result.detail).toContain("model refused to generate");
    }
    expect(calls).toBe(2);
  });

  test("second attempt prompt contains prior error context", async () => {
    const prompts: string[] = [];
    let calls = 0;

    await importInventory(
      { image_b64: "AA==", media_type: "image/jpeg" },
      {
        model: dummyModel,
        generate: (async (args: { messages: { content: { type: string; text?: string }[] }[] }) => {
          calls++;
          const textPart = args.messages[0]?.content.find((c) => c.type === "text");
          if (textPart?.text) prompts.push(textPart.text);
          if (calls === 1) throw new Error("parse error: missing display_name");
          return { object: SAMPLE_RESPONSE } as never;
        }) as never,
      },
    );

    expect(prompts[0]).toContain("Catalog every bottle");
    expect(prompts[1]).toContain("parse error: missing display_name");
  });
});
