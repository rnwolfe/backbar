/**
 * Bar Mode — a full-screen, big-touch SERVICE surface for making drinks during
 * a party (flag: `service-mode`). Deliberately tiny: two actions, large targets,
 * none of the dense console chrome.
 *
 *   • MAKE — tap a currently-makeable recipe → confirm → pour (default bindings)
 *   • POUR — tap an open bottle → tap an oz button → quick custom pour
 *
 * Reuses the existing pour plumbing (api.pour / api.pourCustom) and live store
 * data (makeable + bottles). After any pour we hydrate so levels + makeability
 * stay honest without depending on the socket.
 *
 * Kept intentionally small — adding inventory edits / calibration / settings
 * here would erode the whole point. Those live back in the console (✕ EXIT).
 */
import { useMemo, useState } from "react";
import { api, type MakeableItem } from "../api/client";
import { store, useStore } from "../store/useStore";
import { T } from "../console/tokens";

const QUICK_OZ: readonly { label: string; ml: number }[] = [
  { label: "½ oz", ml: 15 },
  { label: "1 oz", ml: 30 },
  { label: "1½ oz", ml: 45 },
  { label: "2 oz", ml: 60 },
];

type Tab = "make" | "pour";

export function ServiceMode({ onClose, onToast, accent }: { onClose(): void; onToast(t: string): void; accent: string }) {
  const makeable = useStore((s) => s.makeable);
  const bottles = useStore((s) => s.bottles);

  const [tab, setTab] = useState<Tab>("make");
  const [confirmRecipe, setConfirmRecipe] = useState<MakeableItem | null>(null);
  const [pourBottleId, setPourBottleId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const makeableNow = useMemo(
    () => makeable.filter((m) => m.state === "makeable").sort((a, b) => a.recipe.name.localeCompare(b.recipe.name)),
    [makeable],
  );
  const openBottles = useMemo(
    () =>
      bottles
        .filter((b) => b.status === "open" && b.level_ml > 0)
        .sort((a, b) => (a.product?.name ?? a.product_id).localeCompare(b.product?.name ?? b.product_id)),
    [bottles],
  );
  const bottleName = (id: string) => {
    const b = bottles.find((x) => x.id === id);
    return b ? (b.product?.name ?? b.product_id) : id;
  };
  const pourBottle = pourBottleId ? bottles.find((b) => b.id === pourBottleId) ?? null : null;

  async function makeRecipe(item: MakeableItem) {
    if (busy) return;
    setBusy(true);
    try {
      await api.pour({ recipe_id: item.recipe_id, overrides: item.bindings.map((b) => ({ bottle_id: b.bottle_id, ml: b.ml })) });
      await store.hydrate();
      onToast(`poured · ${item.recipe.name}`);
      setConfirmRecipe(null);
    } catch (e) {
      onToast(e instanceof Error ? `pour failed — ${e.message}` : "pour failed");
    } finally {
      setBusy(false);
    }
  }

  async function quickPour(bottleId: string, ml: number) {
    if (busy) return;
    setBusy(true);
    try {
      await api.pourCustom({ bottle_id: bottleId, ml });
      await store.hydrate();
      onToast(`poured · ${ml}ml ${bottleName(bottleId)}`);
      setPourBottleId(null);
    } catch (e) {
      onToast(e instanceof Error ? `pour failed — ${e.message}` : "pour failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: T.bg,
        display: "flex",
        flexDirection: "column",
        paddingTop: "var(--safe-top, 0px)",
        paddingBottom: "var(--safe-bottom, 0px)",
      }}
    >
      {/* Header: segmented Make/Pour + EXIT */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 16px",
          borderBottom: `1px solid ${T.hairline}`,
        }}
      >
        <div style={{ display: "flex", gap: 6, flex: 1 }}>
          {(["make", "pour"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                maxWidth: 180,
                height: 52,
                background: tab === t ? accent : "transparent",
                color: tab === t ? T.bg : T.inkMuted,
                border: `1px solid ${tab === t ? accent : T.hairline2}`,
                fontFamily: T.mono,
                fontSize: 14,
                letterSpacing: "0.16em",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t === "make" ? "MAKE" : "QUICK POUR"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            height: 52,
            padding: "0 18px",
            background: "transparent",
            border: `1px solid ${T.hairline2}`,
            color: T.inkMuted,
            fontFamily: T.mono,
            fontSize: 14,
            letterSpacing: "0.16em",
            cursor: "pointer",
          }}
        >
          ✕ EXIT
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
        {tab === "make" ? (
          makeableNow.length === 0 ? (
            <Empty text="Nothing makeable right now. Open more bottles or check inventory in the console." />
          ) : (
            <Grid>
              {makeableNow.map((m) => (
                <BigCard key={m.recipe_id} accent={accent} onClick={() => setConfirmRecipe(m)}>
                  <div style={{ fontSize: 22, fontWeight: 600, color: T.ink, lineHeight: 1.15 }}>{m.recipe.name}</div>
                  <div style={{ fontSize: 12, color: T.inkMuted, fontFamily: T.mono, marginTop: 6 }}>
                    {[m.recipe.family, m.recipe.glass].filter(Boolean).join(" · ") || "tap to pour"}
                  </div>
                </BigCard>
              ))}
            </Grid>
          )
        ) : openBottles.length === 0 ? (
          <Empty text="No open bottles with stock. Open a bottle in the console first." />
        ) : (
          <Grid>
            {openBottles.map((b) => (
              <BigCard key={b.id} accent={accent} onClick={() => setPourBottleId(b.id)}>
                <div style={{ fontSize: 20, fontWeight: 600, color: T.ink, lineHeight: 1.15 }}>
                  {b.product?.name ?? b.product_id}
                </div>
                <div style={{ fontSize: 12, color: T.inkMuted, fontFamily: T.mono, marginTop: 6 }}>
                  {Math.round(b.level_ml)}
                  <span style={{ color: T.inkDim }}>/{b.full_ml}ml</span>
                </div>
              </BigCard>
            ))}
          </Grid>
        )}
      </div>

      {/* Confirm: make recipe */}
      {confirmRecipe ? (
        <Sheet onCancel={() => !busy && setConfirmRecipe(null)}>
          <div style={{ fontSize: 12, fontFamily: T.mono, color: T.inkMuted, letterSpacing: "0.16em" }}>POUR</div>
          <div style={{ fontSize: 28, fontWeight: 600, color: T.ink, marginTop: 4 }}>{confirmRecipe.recipe.name}</div>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
            {confirmRecipe.bindings.map((bd, i) => (
              <div
                key={`${bd.ref}-${i}`}
                style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: T.inkMuted }}
              >
                <span>{bottleName(bd.bottle_id)}</span>
                <span style={{ fontFamily: T.mono, color: T.ink }}>{bd.ml}ml</span>
              </div>
            ))}
          </div>
          <SheetActions
            accent={accent}
            busy={busy}
            confirmLabel={busy ? "POURING…" : "CONFIRM POUR"}
            onCancel={() => setConfirmRecipe(null)}
            onConfirm={() => void makeRecipe(confirmRecipe)}
          />
        </Sheet>
      ) : null}

      {/* Quick-pour oz picker */}
      {pourBottle ? (
        <Sheet onCancel={() => !busy && setPourBottleId(null)}>
          <div style={{ fontSize: 12, fontFamily: T.mono, color: T.inkMuted, letterSpacing: "0.16em" }}>QUICK POUR</div>
          <div style={{ fontSize: 28, fontWeight: 600, color: T.ink, marginTop: 4 }}>
            {pourBottle.product?.name ?? pourBottle.product_id}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginTop: 16 }}>
            {QUICK_OZ.map((q) => (
              <button
                key={q.ml}
                type="button"
                disabled={busy}
                onClick={() => void quickPour(pourBottle.id, q.ml)}
                style={{
                  height: 72,
                  background: T.surface2,
                  border: `1px solid ${T.hairline2}`,
                  color: T.ink,
                  fontFamily: T.mono,
                  fontSize: 20,
                  fontWeight: 600,
                  cursor: busy ? "default" : "pointer",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {q.label}
              </button>
            ))}
          </div>
          <SheetActions accent={accent} busy={busy} cancelOnly onCancel={() => setPourBottleId(null)} />
        </Sheet>
      ) : null}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
      {children}
    </div>
  );
}

function BigCard({ children, accent, onClick }: { children: React.ReactNode; accent: string; onClick(): void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: 104,
        textAlign: "left",
        padding: "16px 16px",
        background: T.surface,
        border: `1px solid ${T.hairline2}`,
        borderLeft: `3px solid ${accent}`,
        color: T.ink,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      {children}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{ padding: "48px 24px", textAlign: "center", color: T.inkMuted, fontSize: 15, lineHeight: 1.6 }}>
      {text}
    </div>
  );
}

function Sheet({ children, onCancel }: { children: React.ReactNode; onCancel(): void }) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 61,
        background: "rgba(5,7,10,0.8)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 520,
          background: T.surface,
          border: `1px solid ${T.hairline2}`,
          padding: "24px 20px",
          paddingBottom: "calc(var(--safe-bottom, 0px) + 24px)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function SheetActions({
  accent,
  busy,
  confirmLabel,
  cancelOnly,
  onCancel,
  onConfirm,
}: {
  accent: string;
  busy: boolean;
  confirmLabel?: string;
  cancelOnly?: boolean;
  onCancel(): void;
  onConfirm?(): void;
}) {
  return (
    <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        style={{
          flex: cancelOnly ? 1 : 0.5,
          height: 60,
          background: "transparent",
          border: `1px solid ${T.hairline2}`,
          color: T.inkMuted,
          fontFamily: T.mono,
          fontSize: 15,
          letterSpacing: "0.12em",
          cursor: busy ? "default" : "pointer",
        }}
      >
        CANCEL
      </button>
      {!cancelOnly && onConfirm ? (
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          style={{
            flex: 1,
            height: 60,
            background: accent,
            border: `1px solid ${accent}`,
            color: T.bg,
            fontFamily: T.mono,
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: "0.12em",
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.7 : 1,
          }}
        >
          {confirmLabel ?? "CONFIRM"}
        </button>
      ) : null}
    </div>
  );
}
