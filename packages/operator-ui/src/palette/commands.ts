import { api } from "../api/client";
import { registerMany, type Command } from "./registry";

/**
 * Built-in commands per spec §5.1 + specs/ui-operator.md §3.
 *
 * Views can register additional commands by calling `register()` at import
 * time — every view module is imported by `App.tsx`, so commands are
 * registered before the palette opens.
 */
const builtins: Command[] = [
  // ─── nav ────────────────────────────────────────────────────────────────
  {
    id: "nav.makeability",
    title: "Go to makeability",
    group: "nav",
    keywords: ["home", "drinks", "live"],
    icon: "▣",
    run: (ctx) => {
      ctx.nav("makeability");
      ctx.palette.close();
    },
  },
  {
    id: "nav.catalog",
    title: "Go to catalog",
    group: "nav",
    keywords: ["products", "skus"],
    icon: "▤",
    run: (ctx) => {
      ctx.nav("catalog");
      ctx.palette.close();
    },
  },
  {
    id: "nav.bottles",
    title: "Go to bottles",
    group: "nav",
    keywords: ["inventory", "levels"],
    icon: "▥",
    run: (ctx) => {
      ctx.nav("bottles");
      ctx.palette.close();
    },
  },
  {
    id: "nav.recipes",
    title: "Go to recipes",
    group: "nav",
    keywords: ["cocktails", "library"],
    icon: "▦",
    run: (ctx) => {
      ctx.nav("recipes");
      ctx.palette.close();
    },
  },
  {
    id: "nav.shopping",
    title: "Go to shopping list",
    group: "nav",
    keywords: ["low", "buy", "muse"],
    icon: "▨",
    run: (ctx) => {
      ctx.nav("shopping");
      ctx.palette.close();
    },
  },
  {
    id: "nav.nodes",
    title: "Go to node health",
    group: "nav",
    keywords: ["fleet", "esp32", "mqtt"],
    icon: "▩",
    run: (ctx) => {
      ctx.nav("nodes");
      ctx.palette.close();
    },
  },

  // ─── recipe / pour ──────────────────────────────────────────────────────
  {
    id: "recipe.log-pour",
    title: "Log pour",
    group: "recipe",
    argKind: "recipe",
    keywords: ["make", "drink", "pour"],
    icon: "↧",
    run: (ctx, arg) => {
      if (arg?.kind !== "recipe") return;
      ctx.palette.pushPourConfirm(arg.value);
    },
  },

  // ─── inventory ──────────────────────────────────────────────────────────
  {
    id: "inventory.add-bottle",
    title: "Add bottle…",
    group: "inventory",
    argKind: "product",
    keywords: ["new", "purchase"],
    icon: "+",
    run: (ctx, arg) => {
      if (arg?.kind !== "product") return;
      ctx.palette.toast(
        `add-bottle prefilled for ${arg.value.name} — confirm dialog ships with task-005 follow-up`,
      );
      ctx.palette.close();
    },
  },

  // ─── AI ─────────────────────────────────────────────────────────────────
  {
    id: "ai.ideate",
    title: "Ideate drink",
    group: "ai",
    keywords: ["suggest", "invent", "ai"],
    icon: "✦",
    run: async (ctx) => {
      try {
        await api.ideate("operator: surprise me", "make-now");
        ctx.palette.toast("ideate request sent");
      } catch (e) {
        ctx.palette.toast(
          e instanceof Error ? e.message : "ideate failed — AI gateway may be disabled",
        );
      }
      ctx.palette.close();
    },
  },

  // ─── menu ───────────────────────────────────────────────────────────────
  {
    id: "menu.publish",
    title: "Publish guest menu",
    group: "menu",
    keywords: ["snapshot", "vercel"],
    icon: "↥",
    run: async (ctx) => {
      try {
        const res = await api.publishMenu();
        ctx.palette.toast(`published ${res.count} recipes → ${res.url}`);
      } catch (e) {
        ctx.palette.toast(e instanceof Error ? e.message : "publish failed");
      }
      ctx.palette.close();
    },
  },

  // ─── fleet ──────────────────────────────────────────────────────────────
  {
    id: "fleet.recalibrate",
    title: "Recalibrate node",
    group: "fleet",
    argKind: "node",
    keywords: ["tare", "calibrate"],
    icon: "⚙",
    run: (ctx, arg) => {
      if (arg?.kind !== "node") return;
      ctx.nav("nodes");
      ctx.palette.toast(
        `recalibration flow for ${arg.value.device_id} ships with task-008 (P2a)`,
      );
      ctx.palette.close();
    },
  },
];

registerMany(builtins);
