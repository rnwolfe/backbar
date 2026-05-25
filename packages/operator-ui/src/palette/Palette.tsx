import { useEffect, useMemo, useRef, useState } from "react";
import type { Recipe } from "@backbar/core";
import type { MakeableItem } from "../api/client";
import { useStore, store as appStore, type ViewKey } from "../store/useStore";
import {
  listCommands,
  type ArgKind,
  type AppCtx,
  type Command,
  type Entity,
} from "./registry";
import { rank } from "./fuzzy";
import { PourConfirm } from "./pour-confirm";

type Screen =
  | { kind: "list" }
  | { kind: "arg"; command: Command }
  | { kind: "pour-confirm"; recipe: Recipe & { makeable?: MakeableItem } };

interface Item {
  id: string;
  kind: "command" | "entity";
  command?: Command;
  entity?: Entity;
  primary: string;
  secondary?: string;
  group: string;
  icon?: string;
}

const ENTITY_KIND_PREFIX: Record<string, ArgKind | "any"> = {
  ">": "any", // commands only — handled separately
  "@": "bottle",
  "#": "recipe",
};

interface Props {
  open: boolean;
  onClose(): void;
  onNav(view: ViewKey): void;
  /** Deep-link to a specific recipe (opens RecipeDetail overlay via URL). */
  onPickRecipe?(recipe: Recipe): void;
  onToast(text: string): void;
}

export function Palette({ open, onClose, onNav, onPickRecipe, onToast }: Props) {
  const products = useStore((s) => s.products);
  const bottles = useStore((s) => s.bottles);
  const recipes = useStore((s) => s.recipes);
  const makeable = useStore((s) => s.makeable);
  const nodes = useStore((s) => s.nodes);
  const flags = useStore((s) => s.flags);
  const enabledFlags = useMemo(() => {
    const s = new Set<string>();
    for (const f of flags) if (f.enabled) s.add(f.key);
    return s;
  }, [flags]);

  const [screen, setScreen] = useState<Screen>({ kind: "list" });
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    if (open) {
      setScreen({ kind: "list" });
      setQ("");
      setCursor(0);
      queueMicrotask(() => inputRef.current?.focus());
    }
  }, [open]);

  // Build candidate items based on screen + query.
  const items = useMemo<Item[]>(() => {
    if (screen.kind === "arg") return entityItems(screen.command.argKind!, q, {
      products,
      bottles,
      recipes,
      makeable,
      nodes,
    });

    let scope: "all" | "commands" | "bottle" | "recipe" = "all";
    let query = q;
    const first = q.slice(0, 1);
    if (first === ">") {
      scope = "commands";
      query = q.slice(1).trimStart();
    } else if (ENTITY_KIND_PREFIX[first]) {
      const k = ENTITY_KIND_PREFIX[first];
      if (k === "bottle" || k === "recipe") {
        scope = k;
        query = q.slice(1).trimStart();
      }
    }

    if (scope === "commands") return commandItems(query, enabledFlags);
    if (scope === "bottle")
      return entityItems("bottle", query, {
        products,
        bottles,
        recipes,
        makeable,
        nodes,
      });
    if (scope === "recipe")
      return entityItems("recipe", query, {
        products,
        bottles,
        recipes,
        makeable,
        nodes,
      });

    // All: commands + entities together, ranked.
    return [
      ...commandItems(query, enabledFlags),
      ...entityItems("product", query, {
        products,
        bottles,
        recipes,
        makeable,
        nodes,
      }),
      ...entityItems("bottle", query, {
        products,
        bottles,
        recipes,
        makeable,
        nodes,
      }),
      ...entityItems("recipe", query, {
        products,
        bottles,
        recipes,
        makeable,
        nodes,
      }),
      ...entityItems("node", query, {
        products,
        bottles,
        recipes,
        makeable,
        nodes,
      }),
    ].slice(0, 80);
  }, [screen, q, products, bottles, recipes, makeable, nodes, enabledFlags]);

  useEffect(() => {
    setCursor(0);
  }, [screen, q]);

  // Scroll selected option into view.
  useEffect(() => {
    if (!open) return;
    const id = items[cursor]?.id;
    if (!id) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-id="${id}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor, items, open]);

  if (!open) return null;

  const ctx: AppCtx = {
    store: appStore.get(),
    nav: onNav,
    palette: {
      close: onClose,
      pushPourConfirm: (recipe) => setScreen({ kind: "pour-confirm", recipe }),
      toast: onToast,
    },
  };

  const fire = async (it: Item, secondary = false) => {
    if (it.kind === "command" && it.command) {
      if (it.command.argKind && !secondary) {
        setScreen({ kind: "arg", command: it.command });
        setQ("");
        return;
      }
      await it.command.run(ctx);
      return;
    }
    if (screen.kind === "arg" && it.entity) {
      await screen.command.run(ctx, it.entity);
      return;
    }
    // Entity in `list` screen: primary = open detail / navigate; secondary =
    // log pour (recipe-only).
    if (it.entity) {
      if (secondary && it.entity.kind === "recipe") {
        setScreen({ kind: "pour-confirm", recipe: it.entity.value });
        return;
      }
      switch (it.entity.kind) {
        case "product":
          onNav("catalog");
          break;
        case "bottle":
          onNav("bottles");
          break;
        case "recipe":
          // Deep-link to the recipe detail view, not just the list screen,
          // so the operator lands on the cocktail they searched for.
          if (onPickRecipe) onPickRecipe(it.entity.value);
          else onNav("recipes");
          break;
        case "node":
          onNav("shelf");
          break;
      }
      onClose();
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (screen.kind !== "list") {
        setScreen({ kind: "list" });
        setQ("");
        return;
      }
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(items.length - 1, c + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const it = items[cursor];
      if (it) void fire(it, e.metaKey || e.ctrlKey);
    }
  };

  const placeholder =
    screen.kind === "arg"
      ? `pick a ${screen.command.argKind} for "${screen.command.title}"…`
      : "search bottles, recipes, commands…   (>, @, #)";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[10vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl panel shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          // Focus trap — keep tabbing inside the dialog.
          if (e.key === "Tab") e.preventDefault();
        }}
      >
        {screen.kind === "pour-confirm" ? (
          <PourConfirm
            recipe={screen.recipe}
            onClose={onClose}
            onToast={onToast}
          />
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-bg-3 px-3 py-2">
              {screen.kind === "arg" ? (
                <button
                  className="kbd"
                  onClick={() => {
                    setScreen({ kind: "list" });
                    setQ("");
                  }}
                  type="button"
                  aria-label="back"
                >
                  ←
                </button>
              ) : (
                <span className="kbd">⌘K</span>
              )}
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKey}
                placeholder={placeholder}
                aria-label="palette search"
                aria-controls="palette-listbox"
                aria-activedescendant={items[cursor]?.id}
                className="flex-1 bg-transparent text-sm text-fg placeholder:text-fg-3 outline-none"
                autoComplete="off"
                spellCheck={false}
              />
              <span className="kbd hidden sm:inline">Esc</span>
            </div>

            <ul
              id="palette-listbox"
              role="listbox"
              aria-label="palette results"
              ref={listRef}
              className="max-h-[60vh] overflow-y-auto py-1"
            >
              {items.length === 0 ? (
                <li className="px-3 py-2 text-sm text-fg-3">No matches.</li>
              ) : (
                items.map((it, i) => (
                  <li
                    key={it.id}
                    id={it.id}
                    data-id={it.id}
                    role="option"
                    aria-selected={i === cursor}
                    onMouseEnter={() => setCursor(i)}
                    onClick={(e) => fire(it, e.metaKey || e.ctrlKey)}
                    className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-sm border-l-2 ${
                      i === cursor
                        ? "bg-bg-3 border-accent"
                        : "border-transparent hover:bg-bg-2"
                    }`}
                  >
                    <span className="w-5 text-center text-fg-3">{it.icon ?? "·"}</span>
                    <span className="flex-1 truncate">{it.primary}</span>
                    {it.secondary ? (
                      <span className="truncate text-fg-3 text-2xs">{it.secondary}</span>
                    ) : null}
                    <span className="pill">{it.group}</span>
                  </li>
                ))
              )}
            </ul>

            <div className="flex items-center gap-3 border-t border-bg-3 px-3 py-1.5 text-2xs text-fg-3">
              <span><span className="kbd">↑↓</span> move</span>
              <span><span className="kbd">↵</span> select</span>
              <span><span className="kbd">⌘↵</span> secondary</span>
              <span className="ml-auto">
                {screen.kind === "list"
                  ? "type > commands · @ bottles · # recipes"
                  : `argument: ${screen.command.argKind}`}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────

function commandItems(q: string, enabledFlags: Set<string>): Item[] {
  const cmds = listCommands().filter((c) => !c.requiresFlag || enabledFlags.has(c.requiresFlag));
  const ranked = rank([...cmds], q, (c) => [c.title, c.id, ...(c.keywords ?? [])]);
  return ranked.map(({ item: c }) => ({
    id: `cmd-${c.id}`,
    kind: "command",
    command: c,
    primary: c.title,
    secondary: c.argKind ? `↳ ${c.argKind}` : undefined,
    group: c.group,
    icon: c.icon,
  }));
}

interface EntitySources {
  products: import("@backbar/core").Product[];
  bottles: import("../api/client").BottleWithProduct[];
  recipes: import("@backbar/core").Recipe[];
  makeable: import("../api/client").MakeableItem[];
  nodes: import("@backbar/core").Node[];
}

function entityItems(kind: ArgKind, q: string, src: EntitySources): Item[] {
  switch (kind) {
    case "product": {
      const ranked = rank(src.products, q, (p) => [p.name, p.id, p.category, ...p.flavor_tags]);
      return ranked.slice(0, 30).map(({ item: p }) => ({
        id: `product-${p.id}`,
        kind: "entity" as const,
        entity: { kind: "product", value: p },
        primary: p.name,
        secondary: `${p.category}${p.subcategory ? ` · ${p.subcategory}` : ""}`,
        group: "product",
        icon: "▤",
      }));
    }
    case "bottle": {
      const ranked = rank(src.bottles, q, (b) => [
        b.product?.name ?? "",
        b.id,
        b.slot ?? "",
        b.status,
      ]);
      return ranked.slice(0, 30).map(({ item: b }) => ({
        id: `bottle-${b.id}`,
        kind: "entity" as const,
        entity: { kind: "bottle", value: b },
        primary: b.product?.name ?? b.product_id,
        secondary: `${Math.round(b.level_ml)}/${b.full_ml} ml · ${b.status}${b.slot ? ` · ${b.slot}` : ""}`,
        group: "bottle",
        icon: "▥",
      }));
    }
    case "recipe": {
      const map = new Map(src.makeable.map((m) => [m.recipe_id, m]));
      const enriched = src.recipes.map((r) => ({
        ...r,
        makeable: map.get(r.id),
      }));
      const ranked = rank(enriched, q, (r) => [r.name, r.id, r.family ?? "", ...r.tags]);
      return ranked.slice(0, 30).map(({ item: r }) => ({
        id: `recipe-${r.id}`,
        kind: "entity" as const,
        entity: { kind: "recipe", value: r },
        primary: r.name,
        secondary: `${r.family ?? "—"} · ${r.makeable?.state ?? "?"}`,
        group: "recipe",
        icon: "▦",
      }));
    }
    case "node": {
      const ranked = rank(src.nodes, q, (n) => [n.label ?? "", n.device_id, n.status]);
      return ranked.slice(0, 30).map(({ item: n }) => ({
        id: `node-${n.device_id}`,
        kind: "entity" as const,
        entity: { kind: "node", value: n },
        primary: n.label ?? n.device_id,
        secondary: `${n.status}${n.fw_version ? ` · fw ${n.fw_version}` : ""}`,
        group: "node",
        icon: n.status === "online" ? "●" : "○",
      }));
    }
  }
}
