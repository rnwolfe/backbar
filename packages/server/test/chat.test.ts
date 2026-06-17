import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";
import { seedFlavor } from "@backbar/db";
import { buildChatTools, chatSystem } from "../src/ai/chat";
import { loadThread, saveThread } from "../src/ai/chat-store";
import { setup } from "./_helpers";

function ctx() {
  const { deps } = setup();
  seedFlavor(deps.db);
  return deps;
}
const call = (t: { execute?: (i: unknown, o: unknown) => unknown }, input: unknown) =>
  (t.execute as (i: unknown, o: unknown) => Promise<unknown>)(input, {});

describe("buildChatTools", () => {
  test("includes the mixology registry + propose tools", () => {
    const tools = buildChatTools(ctx());
    expect(tools.check_balance).toBeDefined();
    expect(tools.flavor_profile).toBeDefined();
    expect(tools.propose_recipe).toBeDefined();
    expect(tools.propose_menu_publish).toBeDefined();
    expect(tools.propose_86_bottle).toBeDefined();
  });

  test("propose_recipe validates makeability + balance, returns a confirmable card", async () => {
    const tools = buildChatTools(ctx());
    const out = (await call(tools.propose_recipe, {
      name: "House Daiquiri",
      family: "sour",
      method: "shake",
      ingredients: [
        { ref: "rum", ref_type: "product", amount: 60, unit: "ml" },
        { ref: "lime", ref_type: "product", amount: 22, unit: "ml" },
        { ref: "simple", ref_type: "product", amount: 15, unit: "ml" },
      ],
    })) as { kind: string; makeable: boolean; final_abv: number; balance: { sour: number } };
    expect(out.kind).toBe("recipe");
    expect(out.makeable).toBe(true);
    expect(out.final_abv).toBeGreaterThan(0.1);
    expect(out.balance.sour).toBeGreaterThan(0.1);
  });

  test("propose_recipe flags an off-inventory ingredient", async () => {
    const tools = buildChatTools(ctx());
    const out = (await call(tools.propose_recipe, {
      name: "Nope",
      method: "stir",
      ingredients: [{ ref: "unobtainium", ref_type: "product", amount: 60, unit: "ml" }],
    })) as { makeable: boolean; missing: string[] };
    expect(out.makeable).toBe(false);
    expect(out.missing).toContain("unobtainium");
  });

  test("propose_menu_publish resolves known recipe ids", async () => {
    const tools = buildChatTools(ctx());
    const out = (await call(tools.propose_menu_publish, { recipe_ids: ["daiquiri", "ghost"] })) as {
      items: { id: string }[];
      unknown: string[];
    };
    expect(out.items.map((i) => i.id)).toContain("daiquiri");
    expect(out.unknown).toContain("ghost");
  });
});

describe("chatSystem", () => {
  test("grounds in inventory, saved recipes, tool guidance, and UI context", () => {
    const sys = chatSystem(ctx(), { view: "recipes", entity: { kind: "recipe", id: "daiquiri", label: "Daiquiri" } });
    expect(sys).toContain("daiquiri");
    expect(sys).toContain("[[recipe:ID]]");
    expect(sys).toContain("propose_recipe");
    expect(sys).toContain("recipes");
  });
});

describe("chat persistence", () => {
  test("saveThread / loadThread round-trips UIMessages", () => {
    const deps = ctx();
    const messages: UIMessage[] = [
      { id: "m1", role: "user", parts: [{ type: "text", text: "what can I make?" }] },
      { id: "m2", role: "assistant", parts: [{ type: "text", text: "A Daiquiri." }] },
    ];
    saveThread(deps, "t1", messages);
    const loaded = loadThread(deps, "t1");
    expect(loaded.length).toBe(2);
    expect(loaded[0]!.role).toBe("user");
    expect((loaded[1]!.parts[0] as { text: string }).text).toBe("A Daiquiri.");
  });
});
