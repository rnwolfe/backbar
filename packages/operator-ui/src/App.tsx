import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation, useMatch, useNavigate } from "react-router-dom";
import { BottomNav, GridBg, TopBar } from "./console/Chrome";
import { DensityProvider } from "./console/density";
import { BottleDetailOverlay } from "./console/overlays/BottleDetail";
import { CalibrateOverlay } from "./console/overlays/CalibrateOverlay";
import { ProductDetailOverlay } from "./console/overlays/ProductDetail";
import {
  AddBottleOverlay,
  type BottleOverlayMode,
} from "./console/overlays/forms/AddBottleOverlay";
import {
  AddProductOverlay,
  type ProductOverlayMode,
} from "./console/overlays/forms/AddProductOverlay";
import {
  AddRecipeOverlay,
  type RecipeOverlayMode,
} from "./console/overlays/forms/AddRecipeOverlay";
import { ImportPhotoOverlay } from "./console/overlays/forms/ImportPhotoOverlay";
import { BulkImportInventoryOverlay } from "./console/overlays/forms/BulkImportInventoryOverlay";
import type { Bottle, Product, Recipe } from "@backbar/core";
import { api, type ProductTagRow } from "./api/client";
import { RecipeDetailOverlay } from "./console/overlays/RecipeDetail";
import { TareOverlay } from "./console/overlays/TareOverlay";
import { TweaksPanel } from "./console/TweaksPanel";
import { T, accent } from "./console/tokens";
import { Palette } from "./palette/Palette";
import "./palette/commands";
import { store, useBootstrap, useFlag, useStore, type ViewKey } from "./store/useStore";
import { uuid } from "./util/uuid";
import { useViewport } from "./util/useViewport";
import { decorateBottle, joinRecipes, type DecoratedBottle, type JoinedRecipe } from "./data/derive";
import { Bottles } from "./views/Bottles";
import { Catalog } from "./views/Catalog";
import { Dash } from "./views/Dash";
import { Menu } from "./views/Menu";
import { Pours } from "./views/Pours";
import { Recipes } from "./views/Recipes";
import { Settings } from "./views/Settings";
import { Shelf } from "./views/Shelf";

interface Toast {
  id: string;
  text: string;
  ts: number;
}

const VIEW_KEYS: readonly ViewKey[] = [
  "dash",
  "bottles",
  "catalog",
  "recipes",
  "pours",
  "shelf",
  "menu",
  "settings",
];

function viewFromPath(pathname: string): ViewKey {
  const root = pathname.split("/")[1] || "dash";
  return (VIEW_KEYS as readonly string[]).includes(root) ? (root as ViewKey) : "dash";
}

export function App() {
  useBootstrap();
  const location = useLocation();
  const navigate = useNavigate();
  const view = viewFromPath(location.pathname);

  const conn = useStore((s) => s.conn);
  const shelfEnabled = useFlag("shelf");
  const viewport = useViewport();
  const nodes = useStore((s) => s.nodes);
  const bottlesRaw = useStore((s) => s.bottles);
  const recipesRaw = useStore((s) => s.recipes);
  const productsRaw = useStore((s) => s.products);
  const makeable = useStore((s) => s.makeable);
  const tweaks = useStore((s) => s.tweaks);

  // ── Deep-link state: derived from URL params, not useState. ─────────────
  const bottleMatch = useMatch("/bottles/:id");
  const productMatch = useMatch("/catalog/:id");
  const recipeMatch = useMatch("/recipes/:id");
  const activeBottleId = bottleMatch?.params.id ?? null;
  const activeProductId = productMatch?.params.id ?? null;
  const activeRecipeId = recipeMatch?.params.id ?? null;

  const activeBottle: DecoratedBottle | null = useMemo(() => {
    if (!activeBottleId) return null;
    const raw = bottlesRaw.find((b) => b.id === activeBottleId);
    return raw ? decorateBottle(raw) : null;
  }, [activeBottleId, bottlesRaw]);

  const joinedRecipes = useMemo(
    () => joinRecipes(recipesRaw, makeable, productsRaw),
    [recipesRaw, makeable, productsRaw],
  );
  const activeRecipe: JoinedRecipe | null = useMemo(() => {
    if (!activeRecipeId) return null;
    return joinedRecipes.find((r) => r.id === activeRecipeId) ?? null;
  }, [activeRecipeId, joinedRecipes]);

  // ── Ephemeral overlay state (not URL-bound). ────────────────────────────
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [activeCalibrate, setActiveCalibrate] = useState<{ deviceId: string; channel: number } | null>(null);
  const [activeTare, setActiveTare] = useState<DecoratedBottle | null>(null);
  const [productOverlay, setProductOverlay] = useState<
    { mode: ProductOverlayMode; initial?: Product & { tags?: ProductTagRow[] } } | null
  >(null);
  const [bottleOverlay, setBottleOverlay] = useState<
    { mode: BottleOverlayMode; initial?: Bottle } | null
  >(null);
  const [recipeOverlay, setRecipeOverlay] = useState<
    { mode: RecipeOverlayMode; initial?: Recipe } | null
  >(null);
  const [importPhotoOpen, setImportPhotoOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);

  const accentColor = accent(tweaks.accent).primary;

  const pushToast = useCallback((text: string) => {
    const id = uuid();
    setToasts((t) => [...t, { id, text, ts: Date.now() }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  /**
   * Open the product overlay for edit/duplicate. Fetches the full product
   * (including tags via GET /products/:id) before opening so the form lands
   * with everything prefilled.
   */
  const openProductOverlay = useCallback(
    async (mode: ProductOverlayMode, productId?: string) => {
      if (mode === "create") {
        setProductOverlay({ mode });
        return;
      }
      if (!productId) return;
      try {
        const full = await api.getProduct(productId);
        setProductOverlay({ mode, initial: full });
      } catch (e) {
        pushToast(e instanceof Error ? e.message : "failed to load product");
      }
    },
    [pushToast],
  );

  /**
   * Open the recipe overlay for edit/duplicate. Recipes already live on the
   * store with their full ingredient list, so we can pass them through without
   * a network round-trip.
   */
  const openRecipeOverlay = useCallback(
    (mode: RecipeOverlayMode, recipe?: Recipe) => {
      if (mode === "create") {
        setRecipeOverlay({ mode });
        return;
      }
      if (!recipe) return;
      setRecipeOverlay({ mode, initial: recipe });
    },
    [],
  );

  // Re-tint the global selection color when accent changes.
  useEffect(() => {
    const el = document.getElementById("app-accent-style") as HTMLStyleElement | null
      ?? (() => {
        const s = document.createElement("style");
        s.id = "app-accent-style";
        document.head.appendChild(s);
        return s;
      })();
    el.textContent = `::selection { background:${accentColor}; color:${T.bg}; }`;
  }, [accentColor]);

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

  const nav = useCallback((v: ViewKey) => navigate(`/${v}`), [navigate]);

  // Navigation helpers (used by view callbacks + palette). All eventually
  // route through `navigate` so the URL is the source of truth.
  const openBottle = useCallback((b: DecoratedBottle) => navigate(`/bottles/${b.id}`), [navigate]);
  const openProduct = useCallback((id: string) => navigate(`/catalog/${id}`), [navigate]);
  const openRecipe = useCallback((r: JoinedRecipe | Recipe) => navigate(`/recipes/${r.id}`), [navigate]);
  const closeDetail = useCallback((screen: ViewKey) => navigate(`/${screen}`), [navigate]);

  const onlineNodes = nodes.filter((n) => n.status === "online").length;
  const lowCount = bottlesRaw.filter((b) => b.full_ml > 0 && b.level_ml / b.full_ml < 0.15).length;

  return (
    <DensityProvider value={tweaks.density}>
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: T.bg,
          color: T.ink,
          fontFamily: T.body,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <GridBg />
        <TopBar
          view={view}
          onNav={nav}
          conn={conn}
          onlineNodes={onlineNodes}
          totalNodes={nodes.length}
          lowCount={lowCount}
          showFleetTicker={tweaks.showFleetTickerInTopBar && shelfEnabled}
          onOpenPalette={() => setPaletteOpen(true)}
          accentColor={accentColor}
          hiddenTabs={shelfEnabled ? undefined : ["shelf"]}
          isMobile={viewport.isMobile}
        />

        <main
          style={{
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            display: "flex",
            position: "relative",
            zIndex: 1,
            // Reserve room for the fixed BottomNav on mobile so content's
            // scroll bottom + sticky-action footers don't sit behind it.
            paddingBottom: viewport.isMobile ? "calc(58px + var(--safe-bottom, 0px))" : 0,
          }}
        >
          <Routes>
            <Route path="/" element={<Navigate to="/dash" replace />} />
            <Route path="/dash" element={<Dash onPickRecipe={openRecipe} />} />
            <Route
              path="/bottles/*"
              element={
                <Bottles
                  onPickBottle={openBottle}
                  onAddBottle={() => setBottleOverlay({ mode: "create" })}
                  onBulkImportPhoto={() => setBulkImportOpen(true)}
                />
              }
            />
            <Route
              path="/catalog/*"
              element={
                <Catalog
                  onAddProduct={() => void openProductOverlay("create")}
                  onEditProduct={(id) => void openProductOverlay("edit", id)}
                  onDuplicateProduct={(id) => void openProductOverlay("duplicate", id)}
                  onPickProduct={openProduct}
                />
              }
            />
            <Route
              path="/recipes/*"
              element={
                <Recipes
                  onPickRecipe={openRecipe}
                  onAddRecipe={() => openRecipeOverlay("create")}
                  onEditRecipe={(r) => openRecipeOverlay("edit", r)}
                  onDuplicateRecipe={(r) => openRecipeOverlay("duplicate", r)}
                  onImportPhoto={() => setImportPhotoOpen(true)}
                />
              }
            />
            <Route path="/pours" element={<Pours />} />
            <Route
              path="/shelf"
              element={
                shelfEnabled ? (
                  <Shelf onCalibrate={(deviceId, channel) => setActiveCalibrate({ deviceId, channel })} />
                ) : (
                  <Navigate to="/dash" replace />
                )
              }
            />
            <Route path="/menu" element={<Menu />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/dash" replace />} />
          </Routes>
        </main>

        {activeRecipe ? (
          <RecipeDetailOverlay
            recipe={activeRecipe}
            onClose={() => closeDetail("recipes")}
            accent={accentColor}
            onToast={pushToast}
            onEdit={(r) => {
              closeDetail("recipes");
              openRecipeOverlay("edit", r);
            }}
            onDuplicate={(r) => {
              closeDetail("recipes");
              openRecipeOverlay("duplicate", r);
            }}
          />
        ) : null}

        {activeBottle ? (
          <BottleDetailOverlay
            bottle={activeBottle}
            onClose={() => closeDetail("bottles")}
            accent={accentColor}
            onTare={(b) => setActiveTare(b)}
            onToast={pushToast}
            onPickProduct={(productId) => openProduct(productId)}
            onEdit={(b) => {
              closeDetail("bottles");
              setBottleOverlay({ mode: "edit", initial: b.raw });
            }}
            onDuplicate={(b) => {
              closeDetail("bottles");
              setBottleOverlay({ mode: "duplicate", initial: b.raw });
            }}
          />
        ) : null}

        {activeProductId ? (
          <ProductDetailOverlay
            productId={activeProductId}
            accent={accentColor}
            onClose={() => closeDetail("catalog")}
            onPickBottle={(b) => openBottle(b)}
            onPickRecipe={(r) => openRecipe(r)}
            onToast={pushToast}
            onEdit={(p) => {
              closeDetail("catalog");
              setProductOverlay({ mode: "edit", initial: p });
            }}
            onDuplicate={(p) => {
              closeDetail("catalog");
              setProductOverlay({ mode: "duplicate", initial: p });
            }}
          />
        ) : null}

        {activeCalibrate ? (
          <CalibrateOverlay
            deviceId={activeCalibrate.deviceId}
            channel={activeCalibrate.channel}
            onClose={() => {
              setActiveCalibrate(null);
              // Refresh /nodes so the channel grid reflects the new cal state.
              void store.hydrate();
            }}
            onToast={pushToast}
          />
        ) : null}

        {activeTare ? (
          <TareOverlay
            bottle={activeTare}
            onClose={() => {
              setActiveTare(null);
              // Refresh bottles so the new tare lands in the store.
              void store.hydrate();
            }}
            onToast={pushToast}
          />
        ) : null}

        {productOverlay ? (
          <AddProductOverlay
            mode={productOverlay.mode}
            initial={productOverlay.initial}
            onClose={() => setProductOverlay(null)}
            onToast={pushToast}
          />
        ) : null}
        {bottleOverlay ? (
          <AddBottleOverlay
            mode={bottleOverlay.mode}
            initial={bottleOverlay.initial}
            onClose={() => setBottleOverlay(null)}
            onToast={pushToast}
          />
        ) : null}
        {recipeOverlay ? (
          <AddRecipeOverlay
            mode={recipeOverlay.mode}
            initial={recipeOverlay.initial}
            onClose={() => setRecipeOverlay(null)}
            onToast={pushToast}
          />
        ) : null}
        {importPhotoOpen ? (
          <ImportPhotoOverlay onClose={() => setImportPhotoOpen(false)} onToast={pushToast} />
        ) : null}
        {bulkImportOpen ? (
          <BulkImportInventoryOverlay onClose={() => setBulkImportOpen(false)} onToast={pushToast} />
        ) : null}

        <Palette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          onNav={(v) => nav(v)}
          onPickRecipe={(r) => openRecipe(r)}
          onToast={pushToast}
          onBulkImportInventory={() => setBulkImportOpen(true)}
        />

        {/* TweaksPanel is desktop-only; the mobile chrome doesn't have room
            for a floating accessory. Operators get the same controls in
            Settings → Appearance. */}
        {viewport.isMobile ? null : <TweaksPanel />}

        {viewport.isMobile ? (
          <BottomNav
            view={view}
            onNav={nav}
            accentColor={accentColor}
            hiddenTabs={shelfEnabled ? undefined : ["shelf"]}
          />
        ) : null}

        <div
          style={{
            pointerEvents: "none",
            position: "fixed",
            // Toasts sit above the BottomNav on mobile and above the floating
            // TweaksPanel trigger on desktop.
            bottom: viewport.isMobile ? "calc(72px + var(--safe-bottom, 0px))" : 56,
            right: 14,
            left: viewport.isMobile ? 14 : "auto",
            zIndex: 40,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              role="status"
              style={{
                pointerEvents: "auto",
                padding: "8px 12px",
                background: T.surface,
                border: `1px solid ${T.hairline2}`,
                color: T.inkMuted,
                fontFamily: T.body,
                fontSize: 12,
                boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
                maxWidth: 360,
              }}
            >
              {t.text}
            </div>
          ))}
        </div>
      </div>
    </DensityProvider>
  );
}
