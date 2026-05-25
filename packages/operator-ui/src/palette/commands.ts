import { api } from "../api/client";
import { registerMany, type Command } from "./registry";

/**
 * Built-in palette commands. Views can register additional commands by
 * calling `register()` at import time — every view module is imported by
 * `App.tsx`, so commands are available before the palette opens.
 */
const builtins: Command[] = [
  // ─── nav (Console tabs) ─────────────────────────────────────────────────
  {
    id: "nav.dash",
    title: "Go to dashboard",
    group: "nav",
    keywords: ["home", "service", "overview"],
    icon: "▣",
    run: (ctx) => {
      ctx.nav("dash");
      ctx.palette.close();
    },
  },
  {
    id: "nav.bottles",
    title: "Go to bottles",
    group: "nav",
    keywords: ["inventory", "levels", "wall"],
    icon: "▥",
    run: (ctx) => {
      ctx.nav("bottles");
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
    id: "nav.recipes",
    title: "Go to recipes",
    group: "nav",
    keywords: ["cocktails", "library", "makeable"],
    icon: "▦",
    run: (ctx) => {
      ctx.nav("recipes");
      ctx.palette.close();
    },
  },
  {
    id: "nav.pours",
    title: "Go to pour history",
    group: "nav",
    keywords: ["analytics", "history", "depletion"],
    icon: "▧",
    run: (ctx) => {
      ctx.nav("pours");
      ctx.palette.close();
    },
  },
  {
    id: "nav.shelf",
    title: "Go to smart shelf",
    group: "nav",
    keywords: ["fleet", "esp32", "mqtt", "nodes"],
    icon: "▩",
    requiresFlag: "shelf",
    run: (ctx) => {
      ctx.nav("shelf");
      ctx.palette.close();
    },
  },
  {
    id: "nav.menu",
    title: "Go to guest menu",
    group: "nav",
    keywords: ["publish", "snapshot", "guest"],
    icon: "▨",
    run: (ctx) => {
      ctx.nav("menu");
      ctx.palette.close();
    },
  },
  {
    id: "nav.settings",
    title: "Go to settings",
    group: "nav",
    keywords: ["admin", "reset", "reseed"],
    icon: "⚙",
    run: (ctx) => {
      ctx.nav("settings");
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
  {
    id: "inventory.log-shot",
    title: "Log shot (1 oz / 30 ml)",
    group: "inventory",
    argKind: "bottle",
    keywords: ["pour", "shot", "manual", "custom", "subtract"],
    icon: "↧",
    run: async (ctx, arg) => {
      if (arg?.kind !== "bottle") return;
      const bottle = arg.value;
      if (bottle.level_ml < 30) {
        ctx.palette.toast(`only ${bottle.level_ml}ml left in ${bottle.product?.name ?? bottle.id}`);
        return;
      }
      try {
        await api.pourCustom({ bottle_id: bottle.id, ml: 30 });
        ctx.palette.toast(`logged 30ml from ${bottle.product?.name ?? bottle.id}`);
      } catch (e) {
        ctx.palette.toast(e instanceof Error ? e.message : "pour failed");
      }
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
        const res = await api.ideate({ brief: "operator: surprise me", mode: "now" });
        if (res.ok) {
          ctx.palette.toast(`✦ ${res.spec.name}`);
        } else {
          ctx.palette.toast(`ideate gave up — reason: ${res.reason}`);
        }
      } catch (e) {
        ctx.palette.toast(e instanceof Error ? e.message : "ideate failed — AI gateway may be disabled");
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
    id: "fleet.calibrate",
    title: "Calibrate channel",
    group: "fleet",
    argKind: "node",
    keywords: ["tare", "calibrate", "weight", "2-point"],
    icon: "⚙",
    requiresFlag: "shelf",
    run: (ctx, arg) => {
      if (arg?.kind !== "node") return;
      ctx.nav("shelf");
      ctx.palette.toast(
        `${arg.value.device_id} → click any channel pill on its card to start the 2-point cal`,
      );
      ctx.palette.close();
    },
  },
];

registerMany(builtins);
