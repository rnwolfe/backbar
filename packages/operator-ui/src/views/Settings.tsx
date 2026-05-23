import { useState } from "react";
import { api, type AdminResetBarResponse, type AdminResetRecipesResponse, type AdminReseedResponse } from "../api/client";
import { store, useStore } from "../store/useStore";

type Pending = "reset-bar" | "reset-recipes" | "reseed" | null;

interface ActionRow {
  key: "reset-bar" | "reset-recipes" | "reseed";
  title: string;
  blurb: string;
  cta: string;
  destructive: boolean;
  confirmPrompt: string;
}

const ACTIONS: ActionRow[] = [
  {
    key: "reset-bar",
    title: "Reset bar",
    blurb: "Delete every product and bottle. Recipes and historical pours stay. Sensor channels keep their device mapping but lose their bottle binding.",
    cta: "Wipe products + bottles",
    destructive: true,
    confirmPrompt: "Delete every product and bottle? Recipes will be kept. This cannot be undone.",
  },
  {
    key: "reset-recipes",
    title: "Reset recipes",
    blurb: "Delete every recipe. The bar (products + bottles) stays. Historical pours keep their bindings; only their recipe link goes null.",
    cta: "Wipe recipes",
    destructive: true,
    confirmPrompt: "Delete every recipe? The bar will be kept. This cannot be undone.",
  },
  {
    key: "reseed",
    title: "Reseed starter bar",
    blurb: "Idempotently insert the layer-1 starter products, bottles, and canon recipes. Safe to run on a populated DB — nothing already present is overwritten.",
    cta: "Run seed",
    destructive: false,
    confirmPrompt: "",
  },
];

export function Settings() {
  const products = useStore((s) => s.products.length);
  const bottles = useStore((s) => s.bottles.length);
  const recipes = useStore((s) => s.recipes.length);
  const [pending, setPending] = useState<Pending>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: ActionRow) {
    if (action.confirmPrompt && !window.confirm(action.confirmPrompt)) return;
    setPending(action.key);
    setError(null);
    setLastResult(null);
    try {
      const result =
        action.key === "reset-bar"
          ? formatReset(await api.adminResetBar())
          : action.key === "reset-recipes"
            ? formatResetRecipes(await api.adminResetRecipes())
            : formatReseed(await api.adminReseed());
      setLastResult(result);
      await store.hydrate();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="h-full overflow-y-auto">
      <header className="flex items-center gap-2 px-3 py-2 border-b border-bg-3">
        <h1 className="text-sm font-medium">Settings</h1>
        <span className="text-2xs text-fg-3">
          {products} products · {bottles} bottles · {recipes} recipes
        </span>
      </header>

      <div className="p-4 max-w-2xl flex flex-col gap-3">
        {ACTIONS.map((a) => (
          <div key={a.key} className="panel p-3 flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-medium">{a.title}</h2>
              <button
                type="button"
                className={`btn ${a.destructive ? "border-danger/60 text-danger hover:bg-danger/10" : "border-accent/40 text-accent hover:bg-accent/10"}`}
                disabled={pending !== null}
                onClick={() => void run(a)}
              >
                {pending === a.key ? "working…" : a.cta}
              </button>
            </div>
            <p className="text-2xs text-fg-3 leading-relaxed">{a.blurb}</p>
          </div>
        ))}

        {lastResult ? (
          <div className="panel p-3 text-2xs text-fg-2 font-mono whitespace-pre-wrap">
            {lastResult}
          </div>
        ) : null}
        {error ? (
          <div className="panel p-3 text-2xs text-danger font-mono whitespace-pre-wrap border-danger/40">
            {error}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function formatReset(r: AdminResetBarResponse): string {
  return `reset bar → ${r.deleted.bottles} bottles, ${r.deleted.products} products deleted`;
}

function formatResetRecipes(r: AdminResetRecipesResponse): string {
  return `reset recipes → ${r.deleted.recipes} recipes deleted`;
}

function formatReseed(r: AdminReseedResponse): string {
  const p = r.report.products;
  const b = r.report.bottles;
  const rc = r.report.recipes;
  return [
    `reseed →`,
    `  products  +${p.inserted} new, ${p.skipped} already present`,
    `  bottles   +${b.inserted} new, ${b.skipped} already present`,
    `  recipes   +${rc.inserted} new, ${rc.skipped} already present`,
  ].join("\n");
}
