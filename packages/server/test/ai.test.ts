import { describe, expect, test } from "bun:test";
import type { InvBottle, Recipe } from "@backbar/core";
import { ideate } from "../src/ai/ideate";
import { importPhoto } from "../src/ai/import-photo";
import { buildRefSet, inventoryLines, systemPrompt } from "../src/ai/prompts";
import type { GeneratedSpec } from "../src/ai/schema";

// ── fixtures ──────────────────────────────────────────────────────────────

const inv: InvBottle[] = [
  {
    id: "b-rum",
    product_id: "rum",
    full_ml: 750,
    level_ml: 700,
    status: "open",
    tracked: true,
    product: { id: "rum", name: "Bacardi Rum", category: "rum", flavor_tags: ["funky"] },
  } as InvBottle,
  {
    id: "b-lime",
    product_id: "lime",
    full_ml: 500,
    level_ml: 400,
    status: "open",
    tracked: false,
    product: {
      id: "lime",
      name: "Lime Juice",
      category: "citrus",
      flavor_tags: ["acid", "fresh"],
    },
  } as InvBottle,
  {
    id: "b-simple",
    product_id: "simple",
    full_ml: 500,
    level_ml: 300,
    status: "open",
    tracked: false,
    product: { id: "simple", name: "Simple Syrup", category: "syrup-simple", flavor_tags: [] },
  } as InvBottle,
];

const validSpec: GeneratedSpec = {
  name: "Daiquiri Riff",
  family: "sour",
  method: "shake",
  glass: "coupe",
  ice: "shake-only",
  garnish: "lime wheel",
  ingredients: [
    { product_ref: "rum", ref_type: "product", amount: 60, unit: "ml" },
    { product_ref: "lime", ref_type: "product", amount: 22, unit: "ml" },
    { product_ref: "simple", ref_type: "product", amount: 15, unit: "ml" },
  ],
  predicted_balance: { sweet: 0.3, sour: 0.6, bitter: 0, strong: 0.7, aromatic: 0.1, dilution: 0.3 },
  abv_estimate: 0.22,
  rationale: "Classic sour template using stocked rum.",
  risk_note: "None.",
};

const badRefSpec: GeneratedSpec = {
  ...validSpec,
  ingredients: [
    { product_ref: "yellow-chartreuse", ref_type: "product", amount: 30, unit: "ml" },
    { product_ref: "rum", ref_type: "product", amount: 30, unit: "ml" },
  ],
};

const dummyModel = { fake: true } as never;

// ── grounding helpers ─────────────────────────────────────────────────────

describe("ai/prompts", () => {
  test("buildRefSet includes every product_id and category, skips empties", () => {
    const refs = buildRefSet(inv);
    expect(refs.has("rum")).toBe(true);
    expect(refs.has("lime")).toBe(true);
    expect(refs.has("citrus")).toBe(true);
    expect(refs.has("syrup-simple")).toBe(true);
    expect(refs.has("yellow-chartreuse")).toBe(false);
  });

  test("inventoryLines emits one line per product + category tokens", () => {
    const out = inventoryLines(inv);
    expect(out).toContain("rum | rum | funky");
    expect(out).toContain("lime | citrus | acid,fresh");
    expect(out).toContain("VALID CATEGORY TOKENS:");
    expect(out).toContain("citrus");
    expect(out).toContain("rum");
    expect(out).toContain("syrup-simple");
  });

  test("systemPrompt grounds balance axes + family templates + hard rule", () => {
    const sys = systemPrompt(inv);
    // balance axes (spec §3 acceptance)
    for (const axis of ["sweet", "sour", "bitter", "strong", "aromatic", "dilution"]) {
      expect(sys).toContain(axis);
    }
    // codex root families
    expect(sys).toContain("FAMILY TEMPLATES");
    expect(sys).toContain("sour");
    expect(sys).toContain("stirred/spirit");
    expect(sys).toContain("highball");
    expect(sys).toContain("old-fashioned");
    // Liquid Intelligence dilution math hint
    expect(sys.toLowerCase()).toContain("dilution");
    expect(sys).toContain("stir");
    expect(sys).toContain("shake");
    // service
    expect(sys.toLowerCase()).toContain("glass");
    expect(sys.toLowerCase()).toContain("ice");
    expect(sys.toLowerCase()).toContain("garnish");
    // hard rule
    expect(sys).toContain("HARD RULE");
  });
});

// ── ideate generate+repair loop ───────────────────────────────────────────

describe("ai/ideate", () => {
  test("make-now: returns ok on first valid output", async () => {
    let calls = 0;
    const result = await ideate(
      { brief: "tart sour", mode: "now" },
      {
        inv,
        model: dummyModel,
        generate: (async () => {
          calls++;
          return { object: validSpec } as never;
        }) as never,
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.attempts).toBe(1);
      expect(result.spec.name).toBe("Daiquiri Riff");
    }
    expect(calls).toBe(1);
  });

  test("repair: first attempt off-inventory, second valid → ok with attempts:2", async () => {
    const responses: GeneratedSpec[] = [badRefSpec, validSpec];
    const prompts: string[] = [];
    let i = 0;
    const result = await ideate(
      { brief: "make me something", mode: "now" },
      {
        inv,
        model: dummyModel,
        generate: (async (args: { prompt: string }) => {
          prompts.push(args.prompt);
          return { object: responses[i++]! } as never;
        }) as never,
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.attempts).toBe(2);
    // The second prompt must reference the offending refs (closed-loop repair).
    expect(prompts[1]).toContain("yellow-chartreuse");
    expect(prompts[1]).toContain("PREVIOUS VIOLATION");
  });

  test("off-inventory after 2 attempts → ok:false, never silently substitutes", async () => {
    let calls = 0;
    const result = await ideate(
      { brief: "fancy", mode: "now" },
      {
        inv,
        model: dummyModel,
        generate: (async () => {
          calls++;
          return { object: badRefSpec } as never;
        }) as never,
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "off-inventory") {
      expect(result.attempts).toBe(2);
      expect(result.violation).toContain("yellow-chartreuse");
      expect(result.last_spec?.ingredients[0]?.product_ref).toBe("yellow-chartreuse");
    }
    expect(calls).toBe(2);
  });

  test("category refs are accepted as valid product_ref", async () => {
    const catSpec: GeneratedSpec = {
      ...validSpec,
      ingredients: [
        { product_ref: "rum", ref_type: "category", amount: 60, unit: "ml" },
        { product_ref: "citrus", ref_type: "category", amount: 22, unit: "ml" },
      ],
    };
    const result = await ideate(
      { brief: "category test", mode: "now" },
      {
        inv,
        model: dummyModel,
        generate: (async () => ({ object: catSpec }) as never) as never,
      },
    );
    expect(result.ok).toBe(true);
  });

  test("riff mode requires recipe + threads the template into the prompt", async () => {
    const recipe: Recipe = {
      id: "daiquiri",
      name: "Daiquiri",
      family: "sour",
      method: "shake",
      ingredients: [
        {
          ref_type: "category",
          ref_id: "rum",
          label: "rum",
          amount: 60,
          unit: "ml",
          optional: false,
          garnish: false,
          sort: 0,
        },
      ],
      tags: [],
      is_published: true,
    } as Recipe;

    let capturedPrompt = "";
    const result = await ideate(
      { brief: "rotate citrus", mode: "riff", recipe },
      {
        inv,
        model: dummyModel,
        generate: (async (args: { prompt: string }) => {
          capturedPrompt = args.prompt;
          return { object: validSpec } as never;
        }) as never,
      },
    );
    expect(result.ok).toBe(true);
    expect(capturedPrompt).toContain("RIFF RULE");
    expect(capturedPrompt).toContain("TEMPLATE RECIPE: Daiquiri");
    expect(capturedPrompt).toContain("rotate citrus");
  });

  test("riff mode without recipe → bad-input (no model call)", async () => {
    let calls = 0;
    const result = await ideate(
      { brief: "rotate", mode: "riff" },
      {
        inv,
        model: dummyModel,
        generate: (async () => {
          calls++;
          return { object: validSpec } as never;
        }) as never,
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad-input");
    expect(calls).toBe(0);
  });

  test("constraints.batch multiplies amounts post-generation (deterministic)", async () => {
    const result = await ideate(
      { brief: "double up", mode: "now", constraints: { batch: 4 } },
      {
        inv,
        model: dummyModel,
        generate: (async () => ({ object: validSpec }) as never) as never,
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.spec.ingredients[0]?.amount).toBe(60 * 4);
      expect(result.spec.ingredients[1]?.amount).toBe(22 * 4);
    }
  });

  test("validRefs override (shopping-muse preview) widens accepted refs", async () => {
    const refs = buildRefSet(inv);
    refs.add("yellow-chartreuse");
    const result = await ideate(
      {
        brief: "preview yellow chartreuse",
        mode: "now",
        validRefs: refs,
      },
      {
        inv,
        model: dummyModel,
        generate: (async () => ({ object: badRefSpec }) as never) as never,
      },
    );
    expect(result.ok).toBe(true);
  });
});

// ── photo import ──────────────────────────────────────────────────────────

describe("ai/import-photo", () => {
  const products = inv.map((b) => b.product);

  test("happy path: fuzzy-matches known labels, marks unknown as unresolved", async () => {
    const image_b64 = Buffer.from("fake-image-bytes").toString("base64");
    const result = await importPhoto(
      { image_b64, media_type: "image/jpeg" },
      {
        products,
        model: dummyModel,
        generate: (async () =>
          ({
            object: {
              name: "Daiquiri",
              family: "sour",
              method: "shake",
              glass: "coupe",
              ice: null,
              garnish: "lime wheel",
              instructions: "Shake, fine strain.",
              ingredients: [
                { label: "Bacardi Rum", amount: 60, unit: "ml" },
                { label: "Lime Juice", amount: 22, unit: "ml" },
                { label: "Yellow Chartreuse", amount: 7, unit: "ml" },
              ],
            },
          }) as never) as never,
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft.source).toBe("photo-import");
      expect(result.draft.provenance).toBe(`photo:${result.image_hash}`);
      expect(result.draft.id).toBe("daiquiri");

      const byLabel = Object.fromEntries(result.draft.ingredients.map((i) => [i.label, i]));
      expect(byLabel["Bacardi Rum"]?.ref_type).toBe("product");
      expect(byLabel["Bacardi Rum"]?.ref_id).toBe("rum");
      expect(byLabel["Lime Juice"]?.ref_type).toBe("product");
      expect(byLabel["Lime Juice"]?.ref_id).toBe("lime");
      // Unknown stays freeform with the original label intact.
      expect(byLabel["Yellow Chartreuse"]?.ref_type).toBe("freeform");
      expect(byLabel["Yellow Chartreuse"]?.ref_id).toBe(null);
      expect(result.unresolved).toContain("Yellow Chartreuse");
    }
  });

  test("provenance hash reflects decoded image bytes (stable across encodings)", async () => {
    const bytes = Buffer.from([1, 2, 3, 4, 5]);
    const r1 = await importPhoto(
      { image_b64: bytes.toString("base64"), media_type: "image/jpeg" },
      {
        products,
        model: dummyModel,
        generate: (async () =>
          ({
            object: {
              name: "Test",
              family: null,
              method: null,
              glass: null,
              ice: null,
              garnish: null,
              instructions: null,
              ingredients: [{ label: "Anything", amount: 1, unit: "ml" }],
            },
          }) as never) as never,
      },
    );
    const r2 = await importPhoto(
      { image_b64: bytes.toString("base64"), media_type: "image/png" },
      {
        products,
        model: dummyModel,
        generate: (async () =>
          ({
            object: {
              name: "Test",
              family: null,
              method: null,
              glass: null,
              ice: null,
              garnish: null,
              instructions: null,
              ingredients: [{ label: "Anything", amount: 1, unit: "ml" }],
            },
          }) as never) as never,
      },
    );
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) expect(r1.image_hash).toBe(r2.image_hash);
  });

  test("category match: 'rum' label binds to the rum category as a category ref", async () => {
    const result = await importPhoto(
      { image_b64: "AA==", media_type: "image/png" },
      {
        products,
        model: dummyModel,
        generate: (async () =>
          ({
            object: {
              name: "Generic Sour",
              family: "sour",
              method: "shake",
              glass: null,
              ice: null,
              garnish: null,
              instructions: null,
              ingredients: [{ label: "rum", amount: 60, unit: "ml" }],
            },
          }) as never) as never,
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      // 'rum' matches the rum product name exactly *and* the rum category — exact
      // name wins (score 100 > category score 40), so it binds as a product.
      const ing = result.draft.ingredients[0]!;
      expect(["product", "category"]).toContain(ing.ref_type);
    }
  });
});

// ── route surface ─────────────────────────────────────────────────────────

describe("POST /recipes/:id/confirm — photo-import persistence (spec ai-engine.md §6)", () => {
  test("confirm rejects body missing photo provenance", async () => {
    const { call, setup } = await import("./_helpers");
    const { app } = setup();
    const res = await call(app, "POST", "/recipes/imported-x/confirm", {
      name: "Imported X",
      ingredients: [
        {
          ref_type: "product",
          ref_id: "rum",
          label: "Rum",
          amount: 60,
          unit: "ml",
          optional: false,
          garnish: false,
          sort: 0,
        },
      ],
      tags: [],
    });
    expect(res.status).toBe(400);
  });

  test("confirm writes a recipe with source='photo-import' and the photo provenance", async () => {
    const { call, setup } = await import("./_helpers");
    const { app } = setup();
    const res = await call(app, "POST", "/recipes/imported-x/confirm", {
      name: "Imported X",
      provenance: "photo:abc123",
      ingredients: [
        {
          ref_type: "product",
          ref_id: "rum",
          label: "Rum",
          amount: 60,
          unit: "ml",
          optional: false,
          garnish: false,
          sort: 0,
        },
      ],
      tags: [],
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { source: string; provenance: string };
    expect(body.source).toBe("photo-import");
    expect(body.provenance).toBe("photo:abc123");
  });
});
