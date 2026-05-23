import { generateObject, type LanguageModel } from "ai";
import type { InvBottle, Recipe } from "@backbar/core";
import { getDefaultModel } from "./gateway";
import {
  buildRefSet,
  riffPrompt,
  systemPrompt,
  userPrompt,
  type Constraints,
} from "./prompts";
import { GeneratedSpec } from "./schema";

export type IdeateMode = "now" | "riff";

/**
 * The minimum surface of `generateObject` ideate needs. Lets tests inject a
 * fake without faking the rest of the AI SDK.
 */
export type GenerateObjectFn = typeof generateObject;

export interface IdeateInput {
  brief: string;
  mode: IdeateMode;
  constraints?: Constraints;
  /** Required when mode === "riff". */
  recipe?: Recipe;
  /** Override the validRefs set — used internally by shopping-muse preview. */
  validRefs?: Set<string>;
}

export interface IdeateOk {
  ok: true;
  spec: GeneratedSpec;
  attempts: number;
}
export interface IdeateOffInventory {
  ok: false;
  reason: "off-inventory";
  violation: string;
  /** The last off-spec output (returned so callers can route it to the muse). */
  last_spec?: GeneratedSpec;
  attempts: number;
}
export interface IdeateBadInput {
  ok: false;
  reason: "bad-input";
  detail: string;
}
export type IdeateResult = IdeateOk | IdeateOffInventory | IdeateBadInput;

/** Apply batch multiplier post-generation (spec §5: deterministic, not model-side). */
function applyBatch(spec: GeneratedSpec, batch: number | undefined): GeneratedSpec {
  if (!batch || batch === 1) return spec;
  return {
    ...spec,
    ingredients: spec.ingredients.map((i) => ({
      ...i,
      amount: i.amount * batch,
    })),
  };
}

export interface IdeateDeps {
  /** Live inventory snapshot the AI must respect. */
  inv: InvBottle[];
  /** AI SDK model — defaults to gateway('anthropic/claude-sonnet-4'). */
  model?: LanguageModel;
  /** Override generateObject (test injection). */
  generate?: GenerateObjectFn;
}

/**
 * Ideate a cocktail (spec ai-engine.md §4 generate+repair loop).
 *
 *  1. `generateObject` enforces the Zod schema — malformed JSON / shape
 *     issues retry inside the SDK.
 *  2. We layer a *semantic* inventory check on top: every `product_ref` MUST
 *     match a product_id or category in `validRefs`.
 *  3. On violation, re-prompt once with the offending refs called out.
 *  4. After 2 attempts still off-inventory, return `off-inventory` — caller
 *     routes to shopping-muse / "one bottle away." Never silently substitute.
 */
export async function ideate(input: IdeateInput, deps: IdeateDeps): Promise<IdeateResult> {
  if (input.mode === "riff" && !input.recipe) {
    return { ok: false, reason: "bad-input", detail: "riff mode requires recipe" };
  }

  const generate = deps.generate ?? generateObject;
  const model = deps.model ?? getDefaultModel();
  if (!model) {
    return { ok: false, reason: "bad-input", detail: "no gateway model available" };
  }

  const validRefs = input.validRefs ?? buildRefSet(deps.inv);
  const system = systemPrompt(deps.inv);

  let violation: string | null = null;
  let lastSpec: GeneratedSpec | undefined;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const prompt =
      input.mode === "riff" && input.recipe
        ? riffPrompt(input.brief, input.recipe, input.constraints, violation)
        : userPrompt(input.brief, input.constraints, violation);

    const { object } = await generate({
      model,
      schema: GeneratedSpec,
      system,
      prompt,
    });

    const spec = object as GeneratedSpec;
    lastSpec = spec;

    const bad = spec.ingredients.filter((i) => !validRefs.has(i.product_ref));
    if (bad.length === 0) {
      return {
        ok: true,
        spec: applyBatch(spec, input.constraints?.batch),
        attempts: attempt,
      };
    }
    violation =
      `These refs are not in stock: ${bad.map((b) => b.product_ref).join(", ")}. ` +
      `Use only the IN-STOCK product_ids or VALID CATEGORY TOKENS listed in the system prompt.`;
  }

  return {
    ok: false,
    reason: "off-inventory",
    violation: violation ?? "off-inventory",
    last_spec: lastSpec,
    attempts: 2,
  };
}
