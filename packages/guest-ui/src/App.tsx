import { useEffect, useMemo, useState } from "react";
import { filterItems, groupBySection, visible, withAvailability } from "./menu";
import { fetchMenu, resolveMode } from "./source";
import type { GuestMenuPayload, RenderedItem } from "./types";

const BAR_NAME = "The Backbar";

interface LoadState {
  status: "loading" | "ready" | "error";
  payload?: GuestMenuPayload;
  error?: string;
}

export function App() {
  const mode = resolveMode();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchMenu(mode)
      .then((payload) => {
        if (cancelled) return;
        setLoad({ status: "ready", payload });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoad({ status: "error", error: err instanceof Error ? err.message : "unknown error" });
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  // Live mode polls (every 60s) so an 86'd drink updates without a rebuild.
  // Snapshot mode never polls — the JSON is baked.
  useEffect(() => {
    if (mode !== "live") return;
    const handle = setInterval(() => {
      fetchMenu(mode)
        .then((payload) => setLoad({ status: "ready", payload }))
        .catch(() => {
          /* keep last good state; transient errors shouldn't blank the menu */
        });
    }, 60_000);
    return () => clearInterval(handle);
  }, [mode]);

  const items: RenderedItem[] = useMemo(() => {
    if (load.status !== "ready" || !load.payload) return [];
    return withAvailability(load.payload.items);
  }, [load]);

  const sections = useMemo(() => {
    const filtered = filterItems(items, query);
    // In live mode we keep unavailables visible (with muted treatment).
    // Snapshot already filtered to makeable upstream.
    return groupBySection(visible(filtered, mode === "live"));
  }, [items, query, mode]);

  const total = items.length;
  const showing = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <div className="mx-auto max-w-2xl px-5 pb-24 pt-10 sm:pt-16">
      <Cover barName={BAR_NAME} count={total} />

      <div className="mt-10">
        <label className="block">
          <span className="small-caps">Search</span>
          <input
            type="search"
            inputMode="search"
            autoComplete="off"
            spellCheck={false}
            className="menu-search mt-1"
            placeholder="Filter drinks…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter the menu"
          />
        </label>
        {query && (
          <p className="mt-2 text-xs text-ink-3">
            {showing} of {total} drinks
          </p>
        )}
      </div>

      <main className="mt-12">
        {load.status === "loading" && <p className="text-ink-3">Setting up…</p>}
        {load.status === "error" && (
          <p className="text-ink-3">The menu is taking a breath. Try again in a moment.</p>
        )}
        {load.status === "ready" && sections.length === 0 && (
          <p className="text-ink-3">No drinks match that — try a different word.</p>
        )}
        {sections.map((section) => (
          <Section key={section.title} title={section.title} items={section.items} />
        ))}
      </main>

      <footer className="mt-16 border-t border-rule pt-6 text-center small-caps">
        Bar &middot; House &middot; {new Date().getFullYear()}
      </footer>
    </div>
  );
}

function Cover({ barName, count }: { barName: string; count: number }) {
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  return (
    <header className="text-center">
      <p className="small-caps">Tonight</p>
      <h1 className="mt-2 font-display text-4xl sm:text-5xl tracking-tight">{barName}</h1>
      <div className="editorial-rule mx-auto mt-5" aria-hidden />
      <p className="mt-5 font-display italic text-ink-2 text-lg">
        A short list of drinks, made with what's on the shelf.
      </p>
      <p className="mt-2 text-xs text-ink-3">
        {today}
        {count > 0 && <span> &middot; {count} drinks</span>}
      </p>
    </header>
  );
}

function Section({ title, items }: { title: string; items: RenderedItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-12">
      <h2 className="font-display text-2xl">{title}</h2>
      <div className="editorial-rule mt-2" aria-hidden />
      <ul className="mt-5 space-y-7">
        {items.map((item) => (
          <RecipeCard key={item.name} item={item} />
        ))}
      </ul>
    </section>
  );
}

function RecipeCard({ item }: { item: RenderedItem }) {
  const [expanded, setExpanded] = useState(false);
  const cues = [item.glass, item.ice, item.garnish].filter(Boolean).join(" · ");
  // One-line summary on the closed card: prefer first sentence of instructions.
  const summary = item.instructions ? firstSentence(item.instructions) : null;

  return (
    <li className={item.available ? "" : "item-unavailable"}>
      <button
        type="button"
        className="w-full text-left"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-controls={`recipe-${slugify(item.name)}`}
      >
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-display text-xl">{item.name}</h3>
          {!item.available && <span className="small-caps">Currently unavailable</span>}
        </div>
        {summary && <p className="mt-1 text-ink-2">{summary}</p>}
        {cues && <p className="mt-1 small-caps">{cues}</p>}
      </button>
      {expanded && item.instructions && (
        <div
          id={`recipe-${slugify(item.name)}`}
          className="mt-2 border-l-2 border-copper/60 pl-3 text-ink-2"
        >
          <p className="font-display italic">{item.instructions}</p>
          {item.tags.length > 0 && (
            <p className="mt-2 small-caps">{item.tags.join(" · ")}</p>
          )}
        </div>
      )}
    </li>
  );
}

function firstSentence(text: string): string {
  const trimmed = text.trim();
  const m = trimmed.match(/^[^.!?]+[.!?]/);
  return m ? m[0]!.trim() : trimmed;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
