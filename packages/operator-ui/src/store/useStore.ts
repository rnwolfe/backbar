import { useEffect, useRef, useSyncExternalStore } from "react";
import type { Category, Product, Recipe } from "@backbar/core";
import {
  api,
  type BottleWithProduct,
  type MakeableItem,
  type NodeWithChannels,
  type PourRow,
  type PourSummaryDay,
  type ShoppingList,
  type Telemetry,
  type TopBottleRow,
  type TopRecipeRow,
} from "../api/client";
import { connectLive, type ConnState, type LiveEvent } from "../api/ws";
import { setCategoryRegistry } from "../data/derive";
import { uuid } from "../util/uuid";

export type ViewKey =
  | "dash"
  | "bottles"
  | "catalog"
  | "recipes"
  | "pours"
  | "shelf"
  | "menu"
  | "settings";

export interface Tweaks {
  accent: "cyan" | "amber" | "green";
  defaultBottleView: "grid" | "ribbon" | "list";
  showFleetTickerInTopBar: boolean;
  density: "compact" | "regular" | "comfy";
}

const TWEAKS_DEFAULTS: Tweaks = {
  accent: "cyan",
  defaultBottleView: "grid",
  showFleetTickerInTopBar: true,
  density: "regular",
};

const TWEAKS_KEY = "backbar.tweaks.v1";

function loadTweaks(): Tweaks {
  if (typeof localStorage === "undefined") return TWEAKS_DEFAULTS;
  try {
    const raw = localStorage.getItem(TWEAKS_KEY);
    if (!raw) return TWEAKS_DEFAULTS;
    return { ...TWEAKS_DEFAULTS, ...(JSON.parse(raw) as Partial<Tweaks>) };
  } catch {
    return TWEAKS_DEFAULTS;
  }
}

function persistTweaks(t: Tweaks) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(TWEAKS_KEY, JSON.stringify(t));
  } catch {
    // localStorage may be full / disabled — non-fatal.
  }
}

export interface AppStore {
  view: ViewKey;
  conn: ConnState;
  categories: Category[];
  products: Product[];
  bottles: BottleWithProduct[];
  recipes: Recipe[];
  makeable: MakeableItem[];
  nodes: NodeWithChannels[];
  shopping: ShoppingList;
  pours: PourRow[];
  poursSummary: PourSummaryDay[];
  topRecipes: TopRecipeRow[];
  topBottles: TopBottleRow[];
  telemetry: Telemetry | null;
  tweaks: Tweaks;
  /** Set when the operator navigates from Catalog → Bottles for a specific
   *  product; the Bottles view reads it as a one-shot filter and the store
   *  clears it as soon as the view honors it. */
  bottlesFilter: { product_id: string } | null;
  /** Lightweight log of recent lowstock events; surfaced as toasts later. */
  notices: { id: string; kind: "lowstock" | "info"; text: string; ts: number }[];
}

type Listener = () => void;

const initial: AppStore = {
  view: "bottles",
  conn: "connecting",
  categories: [],
  products: [],
  bottles: [],
  recipes: [],
  makeable: [],
  nodes: [],
  shopping: { low: [], muse: [] },
  pours: [],
  poursSummary: [],
  topRecipes: [],
  topBottles: [],
  telemetry: null,
  tweaks: loadTweaks(),
  bottlesFilter: null,
  notices: [],
};

let state: AppStore = initial;
const listeners = new Set<Listener>();

// Coalesce pour-driven refreshes so a fast burst of `reading.updated` events
// triggers exactly one /pours+/telemetry roundtrip.
let pourRefreshTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePourRefresh() {
  if (pourRefreshTimer) clearTimeout(pourRefreshTimer);
  pourRefreshTimer = setTimeout(() => {
    pourRefreshTimer = null;
    void store.refreshPourAnalytics();
  }, 600);
}

function emit() {
  for (const l of listeners) l();
}

function set(patch: Partial<AppStore> | ((s: AppStore) => Partial<AppStore>)) {
  const next = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...next };
  emit();
}

export const store = {
  get(): AppStore {
    return state;
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  setView(view: ViewKey) {
    set({ view });
  },
  filterBottlesByProduct(product_id: string) {
    set({ view: "bottles", bottlesFilter: { product_id } });
  },
  clearBottlesFilter() {
    set({ bottlesFilter: null });
  },
  setTweak<K extends keyof Tweaks>(key: K, value: Tweaks[K]) {
    const next = { ...state.tweaks, [key]: value };
    persistTweaks(next);
    set({ tweaks: next });
  },
  async hydrate() {
    const [
      categories,
      products,
      bottles,
      recipes,
      makeable,
      nodes,
      shopping,
      pours,
      poursSummary,
      topRecipes,
      topBottles,
      telemetry,
    ] = await Promise.all([
      api.categories().catch<Category[]>(() => []),
      api.products(),
      api.bottles(),
      api.recipes(),
      api.makeable(),
      api.nodes(),
      api.shopping(),
      api.pours({ limit: 50 }).catch<PourRow[]>(() => []),
      api.poursSummary(28).catch<PourSummaryDay[]>(() => []),
      api.poursTopRecipes(28).catch<TopRecipeRow[]>(() => []),
      api.poursTopBottles(28).catch<TopBottleRow[]>(() => []),
      api.telemetry().catch<Telemetry | null>(() => null),
    ]);
    setCategoryRegistry(categories);
    set({
      categories,
      products,
      bottles,
      recipes,
      makeable,
      nodes,
      shopping,
      pours,
      poursSummary,
      topRecipes,
      topBottles,
      telemetry,
    });
  },
  async refreshCategories() {
    try {
      const categories = await api.categories();
      setCategoryRegistry(categories);
      set({ categories });
    } catch {
      // Non-blocking — Settings retries via the explicit refresh button.
    }
  },
  async refreshShopping() {
    try {
      const shopping = await api.shopping();
      set({ shopping });
    } catch {
      // Non-blocking — next WS event will trigger another attempt.
    }
  },
  async refreshPourAnalytics() {
    try {
      const [pours, poursSummary, topRecipes, topBottles, telemetry] = await Promise.all([
        api.pours({ limit: 50 }),
        api.poursSummary(28),
        api.poursTopRecipes(28),
        api.poursTopBottles(28),
        api.telemetry(),
      ]);
      set({ pours, poursSummary, topRecipes, topBottles, telemetry });
    } catch {
      // Non-blocking — the next pour event will trigger another attempt.
    }
  },
  applyEvent(e: LiveEvent) {
    switch (e.type) {
      case "hello":
        return;
      case "reading.updated":
        set((s) => ({
          bottles: s.bottles.map((b) =>
            b.id === e.bottle_id ? { ...b, level_ml: e.level_ml } : b,
          ),
        }));
        // Pour readings move analytics — schedule a coalesced refresh.
        if (e.source === "pour") schedulePourRefresh();
        return;
      case "makeable.changed":
        set((s) => ({
          makeable: s.makeable.map((m) =>
            m.recipe_id === e.recipe_id ? { ...m, state: e.state } : m,
          ),
        }));
        return;
      case "node.status":
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.device_id === e.device_id
              ? { ...n, status: e.status, last_seen: e.last_seen }
              : n,
          ),
        }));
        return;
      case "lowstock.crossed":
        set((s) => ({
          notices: [
            {
              id: uuid(),
              kind: "lowstock" as const,
              text: `low stock: ${e.bottle_id} @ ${Math.round(e.level_ml)} ml`,
              ts: Date.now(),
            },
            ...s.notices,
          ].slice(0, 20),
        }));
        void store.refreshShopping();
        return;
    }
  },
  setConn(conn: ConnState) {
    set({ conn });
  },
};

export function useStore<T>(selector: (s: AppStore) => T): T {
  const sel = useRef(selector);
  sel.current = selector;
  return useSyncExternalStore(store.subscribe, () => sel.current(store.get()));
}

/**
 * Mount once at the app root: hydrate from REST then open the WS and patch
 * events into the store. The returned cleanup tears down the WS on unmount.
 */
export function useBootstrap() {
  useEffect(() => {
    void store.hydrate();
    const live = connectLive(store.applyEvent, store.setConn);
    return () => live.close();
  }, []);
}
