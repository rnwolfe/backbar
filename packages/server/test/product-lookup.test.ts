import { describe, expect, test } from "bun:test";
import type { LanguageModel } from "ai";
import { lookupProduct } from "../src/ai/product-lookup";
import type { ProductLookupResult } from "../src/ai/schema";

const dummyModel = { modelId: "dummy" } as unknown as LanguageModel;

const SAMPLE: ProductLookupResult = {
  suggested_id: "buffalo-trace",
  name: "Buffalo Trace",
  category: "bourbon",
  subcategory: "kentucky-straight",
  abv: 0.45,
  distillery: "Buffalo Trace Distillery",
  origin_country: "US",
  origin_region: "Kentucky",
  age_statement_y: null,
  flavor_tags: ["vanilla", "caramel"],
  tags: [{ namespace: "cocktail-codex", value: "old-fashioned-root" }],
  notes: null,
  confidence: "high",
  rationale: "Well-known SKU.",
};

describe("ai/product-lookup", () => {
  test("happy path: returns the model's structured output", async () => {
    const result = await lookupProduct(
      { name: "Buffalo Trace" },
      {
        model: dummyModel,
        generate: (async () => ({ object: SAMPLE }) as never) as never,
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.distillery).toBe("Buffalo Trace Distillery");
      expect(result.result.tags[0]!.namespace).toBe("cocktail-codex");
    }
  });

  test("threads the optional hint into the prompt", async () => {
    let capturedPrompt = "";
    await lookupProduct(
      { name: "Planteray 3 Star", hint: "white rum from Foursquare" },
      {
        model: dummyModel,
        generate: (async (args: { prompt: string }) => {
          capturedPrompt = args.prompt;
          return { object: SAMPLE } as never;
        }) as never,
      },
    );
    expect(capturedPrompt).toContain("Planteray 3 Star");
    expect(capturedPrompt).toContain("Foursquare");
  });

  test("returns extract-failed when generateObject throws", async () => {
    const result = await lookupProduct(
      { name: "Bad Product" },
      {
        model: dummyModel,
        generate: (async () => {
          throw new Error("gateway 502");
        }) as never,
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("extract-failed");
      expect(result.detail).toContain("gateway 502");
    }
  });
});
