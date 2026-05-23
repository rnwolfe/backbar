import { useEffect, useRef, useSyncExternalStore } from "react";
import type { Node as NodeRow, Product, Recipe } from "@backbar/core";
import {
  api,
  type BottleWithProduct,
  type MakeableItem,
  type ShoppingList,
} from "../api/client";
import { connectLive, type ConnState, type LiveEvent } from "../api/ws";

export type ViewKey =
  | "makeability"
  | "catalog"
  | "bottles"
  | "recipes"
  | "shopping"
  | "nodes";

export interface AppStore {
  view: ViewKey;
  conn: ConnState;
  products: Product[];
  bottles: BottleWithProduct[];
  recipes: Recipe[];
  makeable: MakeableItem[];
  nodes: NodeRow[];
  shopping: ShoppingList;
  /** Lightweight log of recent lowstock events; surfaced as toasts later. */
  notices: { id: string; kind: "lowstock" | "info"; text: string; ts: number }[];
}

type Listener = () => void;

const initial: AppStore = {
  view: "makeability",
  conn: "connecting",
  products: [],
  bottles: [],
  recipes: [],
  makeable: [],
  nodes: [],
  shopping: { low: [], muse: [] },
  notices: [],
};

let state: AppStore = initial;
const listeners = new Set<Listener>();

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
  async hydrate() {
    const [products, bottles, recipes, makeable, nodes, shopping] = await Promise.all([
      api.products(),
      api.bottles(),
      api.recipes(),
      api.makeable(),
      api.nodes(),
      api.shopping(),
    ]);
    set({ products, bottles, recipes, makeable, nodes, shopping });
  },
  async refreshShopping() {
    try {
      const shopping = await api.shopping();
      set({ shopping });
    } catch {
      // Non-blocking — next WS event will trigger another attempt.
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
              id: crypto.randomUUID(),
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
