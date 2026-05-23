# specs/ai-engine.md

Detail for `packages/server/ai`. Parent: spec §3. The Zod schema *is* the contract; `generateObject` enforces structure, and an explicit inventory pass enforces that the spec only uses what's on hand.

---

## 1. Gateway setup

```ts
import { generateObject } from "ai";
import { createGateway } from "@ai-sdk/gateway";

const gateway = createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY });  // bootstrapped from ~/.ai_gateway_api_key
const MODEL = gateway("anthropic/claude-sonnet-4");   // route via AI Gateway, not a raw provider key
```

All AI calls go through the Gateway — model routing, observability, and spend live there. No provider SDK keys in the app.

---

## 2. Output schema — `ai/schema.ts`

```ts
import { z } from "zod";
import { Balance, Method } from "@backbar/core/schema";

export const GeneratedSpec = z.object({
  name: z.string(),
  family: z.string(),                 // codex root
  method: Method,
  ratios: z.string(),                 // codex-template ratio string e.g. "2 : 0.75 : 0.75"
  glass: z.string(), ice: z.string(), garnish: z.string(),
  ingredients: z.array(z.object({
    product_ref: z.string(),          // MUST be an in-stock product_id or category token
    ref_type: z.enum(["product", "category"]),
    amount: z.number().positive(), unit: z.enum(["ml", "dash", "barspoon", "top"]),
  })).min(2),
  predicted_balance: Balance,
  abv_estimate: z.number().min(0).max(1),
  rationale: z.string(),
  risk_note: z.string(),
});
export type GeneratedSpec = z.infer<typeof GeneratedSpec>;
```

The model is forced to reference inventory by `product_ref` (not free text), which makes the inventory check deterministic.

---

## 3. Grounding — system prompt

Assembled from constants + the live inventory snapshot. Keep it tight; the schema carries the structure.

```
You are an expert bartender designing balanced, on-spec cocktails.

REASON IN BALANCE AXES (0..1): sweet, sour, bitter, strong, aromatic, dilution.
FAMILY TEMPLATES (start from a root, rotate ONE variable):
 - sour            ~2 : 0.75 : 0.75  (spirit : citrus : sweetener)
 - stirred/spirit  ~2 : 1            (base : modifiers); equal-parts 1:1:1
 - highball        ~1 : 3            (spirit : lengthener)
 - old-fashioned   spirit + ~0.25 sweet + 2 dashes bitters
 - flip/rich       egg/dairy, lower acid
DILUTION & TEMP: predict final ABV and added water by method
 (stir ≈ 20-25% dilution, shake ≈ 25-30%); flag drinks that land too hot or too watery.
SERVICE: choose glass, ice, and garnish appropriate to family + method.

HARD RULE: every ingredient.product_ref MUST be one of the IN-STOCK refs below.
Do not invent ingredients. If the brief needs something absent, get as close as possible
with what's listed and note the compromise in risk_note.

IN-STOCK (product_id | category | flavor_tags):
{inventory_lines}
```

`inventory_lines` built from `core` — one line per in-stock product: `beefeater | gin | juniper,citrus`. Also pass the set of valid `category` tokens.

---

## 4. Generate + repair loop — `ai/ideate.ts`

```ts
export async function ideate(brief: string, constraints: Constraints, inv: InvBottle[]) {
  const validRefs = buildRefSet(inv);             // product_ids ∪ categories present
  for (let attempt = 0; attempt < 2; attempt++) {
    const { object } = await generateObject({
      model: MODEL, schema: GeneratedSpec,
      system: systemPrompt(inv),
      prompt: userPrompt(brief, constraints, attempt > 0 ? lastViolation : null),
    });
    const bad = object.ingredients.filter(i => !validRefs.has(i.product_ref));
    if (bad.length === 0) return { ok: true, spec: object };
    lastViolation = `These refs are not in stock: ${bad.map(b => b.product_ref).join(", ")}. Use only in-stock refs.`;
  }
  // after 2 tries still off-inventory -> route to one-away suggestion instead of substituting
  return { ok: false, reason: "off-inventory", violation: lastViolation };
}
```

Rules: **never silently substitute.** `generateObject` handles malformed JSON / schema retries internally; this loop handles the *semantic* inventory constraint on top. Two attempts max, then degrade to a shopping suggestion ("this idea needs X you don't stock — add it to unlock it").

---

## 5. Modes

- **make-now** (`POST /ai/ideate`, `mode:"now"`) — strict: `validRefs` = in-stock only.
- **riff** (`mode:"riff", recipe_id`) — load the recipe, inject it as the template, instruct: keep the family, rotate exactly one variable (swap modifier / shift ratio / change citrus). Still inventory-constrained.
- **shopping-muse** (`GET /ai/shopping`) — *not a generation*. Pure function: take `one-away` results from `/makeable`, run `core.coverage()` (see `data-model.md` §4) to rank un-owned products by how many drinks each unlocks. Optionally pass the top product to `ideate` with it hypothetically in stock to preview the drink it enables.

`Constraints`: `{ mustUse?: string[], avoid?: string[], glass?: string, abvTarget?: number, batch?: number }`. `batch` multiplies amounts post-generation (deterministic, not model-side).

---

## 6. Recipe photo import — `ai/import-photo.ts`

The legitimate path for owned books. `POST /recipes/import-photo {image_b64, media_type}`:

```ts
const { object } = await generateObject({
  model: MODEL,
  schema: ImportedRecipe,               // Recipe-shaped, ingredients as {label, amount, unit}
  system: "Extract the cocktail recipe from this image. Preserve exact proportions and method. " +
          "Do NOT invent missing fields; leave them null.",
  messages: [{ role: "user", content: [
    { type: "image", image: image_b64 }, { type: "text", text: "Extract the recipe." },
  ]}],
});
```

Then **map ingredient labels → existing products** (fuzzy match on name/category); return:
```
{ draft: Recipe, unresolved: string[] }   // unresolved labels need a product created or manual bind
```
This is a **draft for human confirmation** (`POST /recipes/:id/confirm`), never auto-saved. On save: `source:'photo-import'`, `provenance:'photo:<sha256(image)>'`. Resolved lines become `ref_type:'product'`; unresolved stay `ref_type:'freeform'` with the label until the user creates the product.

---

## Guardrails
- AI output is never trusted re: inventory — §4 validation is mandatory on every generate path.
- No provider keys in app; Gateway only.
- Photo import outputs drafts, not commits.
- `coverage()`/muse is deterministic core logic, not a model call — keep it cheap and offline.
