import { useCallback, useEffect, useState } from "react";
import { NavRail } from "./layout/NavRail";
import { TopBar } from "./layout/TopBar";
import { Palette } from "./palette/Palette";
import "./palette/commands";
import { store, useBootstrap, useStore, type ViewKey } from "./store/useStore";
import { Bottles } from "./views/Bottles";
import { Catalog } from "./views/Catalog";
import { Makeability } from "./views/Makeability";
import { Nodes } from "./views/Nodes";
import { Recipes } from "./views/Recipes";
import { Shopping } from "./views/Shopping";

interface Toast {
  id: string;
  text: string;
  ts: number;
}

export function App() {
  useBootstrap();
  const view = useStore((s) => s.view);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback((text: string) => {
    const id = crypto.randomUUID();
    setToasts((t) => [...t, { id, text, ts: Date.now() }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  // Global ⌘K / Ctrl+K — capture before any view's keymap.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const nav = useCallback((v: ViewKey) => store.setView(v), []);

  return (
    <div className="flex flex-col h-full bg-bg text-fg">
      <TopBar onOpenPalette={() => setPaletteOpen(true)} />
      <div className="flex flex-1 min-h-0">
        <NavRail view={view} onNav={nav} />
        <main className="flex-1 min-w-0">
          {view === "makeability" && <Makeability />}
          {view === "catalog" && <Catalog />}
          {view === "bottles" && <Bottles />}
          {view === "recipes" && <Recipes />}
          {view === "shopping" && <Shopping />}
          {view === "nodes" && <Nodes />}
        </main>
      </div>

      <Palette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNav={nav}
        onToast={pushToast}
      />

      <div className="pointer-events-none fixed bottom-3 right-3 z-40 flex flex-col gap-1.5">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="panel pointer-events-auto px-3 py-1.5 text-2xs text-fg-2 shadow-lg shadow-black/40"
            role="status"
          >
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
