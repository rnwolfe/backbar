/**
 * Agentic chat (specs/ai-chat-spike.md). A streaming, tool-using bartender that
 * runs throughout the operator console. Reuses the mixology tool registry
 * (`buildTools`) for reasoning, adds read-only **propose** tools that surface
 * confirmable actions (save recipe, publish menu, 86 a bottle) — the agent
 * never mutates; the operator confirms in the UI, which hits existing REST.
 */
import {
  convertToModelMessages,
  createIdGenerator,
  stepCountIs,
  streamText,
  tool,
  type ModelMessage,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { Method, Unit, aggregateBalance, balanceFlags, finalAbv } from "@backbar/core";
import { bottles as bottlesRepo, recipes as recipesRepo } from "@backbar/db";
import type { Deps } from "../deps";
import { DEFAULT_MODEL, getGateway } from "./gateway";
import { loadInventory } from "../makeable";
import { systemPrompt } from "./prompts";
import { buildTools } from "./tools";
import { inStockRefs, resolveBalanceIngredients, type ToolIngredient } from "./tools/resolve";

export const CHAT_MODEL = process.env.CHAT_MODEL ?? DEFAULT_MODEL;

/** UI context the dock passes so "is this balanced?" works without re-stating. */
export const ChatContext = z
  .object({
    view: z.string().optional(),
    entity: z.object({ kind: z.string(), id: z.string(), label: z.string().optional() }).optional(),
  })
  .optional();
export type ChatContext = z.infer<typeof ChatContext>;

export const ChatRequest = z.object({
  messages: z.array(z.any()),
  context: ChatContext,
});

const ProposedIngredient = z.object({
  ref: z.string().describe("product slug, category id, or tag value"),
  ref_type: z.enum(["product", "category", "tag", "freeform"]),
  amount: z.number().positive(),
  unit: Unit,
  label: z.string().optional(),
  optional: z.boolean().optional(),
  garnish: z.boolean().optional(),
});

const RecipeProposal = z.object({
  name: z.string(),
  family: z.string().optional(),
  method: Method,
  glass: z.string().optional(),
  ice: z.string().optional(),
  garnish: z.string().optional(),
  instructions: z.string().optional(),
  ingredients: z.array(ProposedIngredient).min(1),
  rationale: z.string().optional(),
});

/** Tools that surface confirmable actions. Read-only — they validate + echo a
 *  structured proposal; the UI renders a confirm card and calls REST. */
function proposeTools(deps: Deps) {
  return {
    propose_recipe: tool({
      description:
        "Propose a finished cocktail for the operator to save. Validates makeability + balance and returns a confirmable card — the operator saves it, you never save directly. Call this once you've designed a drink you'd recommend keeping.",
      inputSchema: RecipeProposal,
      execute: async (proposal) => {
        const stock = inStockRefs(deps);
        const missing = proposal.ingredients
          .filter((i) => i.ref_type !== "freeform")
          .map((i) => i.ref)
          .filter((r) => !stock.has(r));
        const balanceIngredients = resolveBalanceIngredients(
          deps,
          proposal.ingredients
            .filter((i) => i.ref_type !== "freeform")
            .map((i) => ({ ref: i.ref, amount: i.amount, unit: i.unit }) as ToolIngredient),
        );
        const balance = aggregateBalance(balanceIngredients, proposal.method);
        const flags = balanceFlags(balanceIngredients, proposal.method);
        return {
          kind: "recipe",
          proposal,
          makeable: missing.length === 0,
          missing,
          balance,
          final_abv: Number(finalAbv(balanceIngredients, proposal.method).toFixed(3)),
          flags,
        };
      },
    }),

    propose_menu_publish: tool({
      description:
        "Propose a guest menu (a set of recipe ids) for the operator to publish. Returns a confirmable card; the operator publishes. Use when curating tonight's list.",
      inputSchema: z.object({ recipe_ids: z.array(z.string()).min(1) }),
      execute: async ({ recipe_ids }) => {
        const known = new Map(recipesRepo(deps.db).list().map((r) => [r.id, r.name] as const));
        const items = recipe_ids
          .filter((id) => known.has(id))
          .map((id) => ({ id, name: known.get(id)! }));
        const unknown = recipe_ids.filter((id) => !known.has(id));
        return { kind: "menu_publish", items, unknown };
      },
    }),

    propose_86_bottle: tool({
      description:
        "Propose marking a bottle as 86'd (out) — returns a confirmable card; the operator applies it. Use when a bottle is empty or being pulled from service.",
      inputSchema: z.object({ bottle_id: z.string() }),
      execute: async ({ bottle_id }) => {
        const b = bottlesRepo(deps.db).get(bottle_id);
        return { kind: "eighty_six", bottle_id, found: b != null };
      },
    }),
  };
}

export function buildChatTools(deps: Deps) {
  return { ...buildTools(deps), ...proposeTools(deps) };
}

const TOOL_GUIDANCE = `
TOOLS — you have a mixology toolkit. Use it; don't guess.
- Before recommending a drink, verify it: check_makeable (inventory is non-negotiable),
  check_balance, and classify_family. Use flavor_profile / pairing_score / top_pairings /
  flavor_similar to reason about flavor and substitutions, and score_food_pairing for food.
- To let the operator ACT, call a propose_* tool — propose_recipe to save a drink,
  propose_menu_publish to publish a guest menu, propose_86_bottle to pull a bottle. These
  surface a confirm button; you never mutate state yourself.

REFERENCES — when you mention a specific in-stock bottle, product, or saved recipe, write it
as [[bottle:ID]], [[product:ID]], or [[recipe:ID]] (using the exact id) so the console links
it. Only reference ids that exist in the lists above. Keep prose tight and operator-friendly.
`;

/** Build the chat system prompt: mixology + live inventory + saved recipes + UI context. */
export function chatSystem(deps: Deps, context?: ChatContext): string {
  const inv = loadInventory(deps.db);
  const recipeLines = recipesRepo(deps.db)
    .list()
    .map((r) => `  ${r.id} | ${r.name}${r.family ? ` (${r.family})` : ""}`)
    .join("\n");
  let ctx = "";
  if (context?.view) ctx += `\nThe operator is currently viewing the "${context.view}" screen.`;
  if (context?.entity)
    ctx += `\nThey have ${context.entity.kind} "${context.entity.label ?? context.entity.id}" (id: ${context.entity.id}) in focus.`;
  return `${systemPrompt(inv)}

SAVED RECIPES (id | name):
${recipeLines || "  (none yet)"}
${TOOL_GUIDANCE}${ctx}`;
}

/** Stream a chat turn. Returns a UI-message-stream Response for `useChat`. */
export function streamChat(
  deps: Deps,
  opts: { messages: UIMessage[]; context?: ChatContext; onFinish?: (m: UIMessage[]) => void },
) {
  const gateway = getGateway();
  if (!gateway) throw new Error("ai-disabled");
  const modelMessages: ModelMessage[] = convertToModelMessages(opts.messages);
  const result = streamText({
    model: gateway(CHAT_MODEL),
    system: chatSystem(deps, opts.context),
    messages: modelMessages,
    tools: buildChatTools(deps),
    stopWhen: stepCountIs(10),
  });
  return result.toUIMessageStreamResponse({
    sendReasoning: true,
    originalMessages: opts.messages,
    generateMessageId: createIdGenerator({ prefix: "msg", size: 16 }),
    onFinish: opts.onFinish ? ({ messages }) => opts.onFinish!(messages) : undefined,
  });
}
