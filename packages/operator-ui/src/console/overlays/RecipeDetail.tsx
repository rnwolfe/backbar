/**
 * Recipe detail / pour binding overlay. Modal card pinned center; click
 * outside to dismiss. The right rail wraps the existing POST /pour flow so
 * the operator can commit the depletion straight from the recipe surface.
 */
import { useMemo, useState } from "react";
import type { Recipe } from "@backbar/core";
import { api } from "../../api/client";
import { Cell } from "../Cells";
import { T } from "../tokens";
import type { JoinedRecipe } from "../../data/derive";
import { decorateBottle } from "../../data/derive";
import { useStore } from "../../store/useStore";

interface Binding {
  ref: string;
  bottle_id: string;
  ml: number;
}

export function RecipeDetailOverlay({
  recipe,
  onClose,
  accent,
  onToast,
  onEdit,
  onDuplicate,
}: {
  recipe: JoinedRecipe;
  onClose(): void;
  accent: string;
  onToast?(text: string): void;
  onEdit?(r: Recipe): void;
  onDuplicate?(r: Recipe): void;
}) {
  const bottlesRaw = useStore((s) => s.bottles);
  const products = useStore((s) => s.products);
  const decorated = useMemo(() => bottlesRaw.map(decorateBottle), [bottlesRaw]);

  const axes = ["sweet", "sour", "bitter", "strong", "aromatic", "dilution"];
  const total = recipe.ingredients.reduce((s, i) => s + i.amount_ml, 0);

  // For each ingredient, resolve a binding (most-depleted bottle that has enough).
  const initialBindings = useMemo<{ ing: (typeof recipe.ingredients)[number]; binding: Binding | null; bottle: ReturnType<typeof decorateBottle> | null; enough: boolean; afterMl: number }[]>(() => {
    return recipe.ingredients.map((ing) => {
      // Server-provided binding from /makeable takes precedence.
      const serverBinding =
        recipe.makeable?.bindings.find(
          (b) => b.ref === ing.product || (products.find((p) => p.id === b.bottle_id) && b.bottle_id === ing.product),
        ) ?? null;
      let bottle = serverBinding ? decorated.find((b) => b.id === serverBinding.bottle_id) ?? null : null;
      if (!bottle) {
        const candidates = decorated.filter((b) => b.raw.product_id === ing.product);
        bottle = candidates.sort((a, c) => a.level_ml - c.level_ml).find((b) => b.level_ml >= ing.amount_ml) ?? candidates[0] ?? null;
      }
      const ml = serverBinding?.ml ?? ing.amount_ml;
      const enough = !!bottle && bottle.level_ml >= ml;
      const afterMl = bottle ? Math.max(0, bottle.level_ml - ml) : 0;
      return {
        ing,
        binding: bottle ? { ref: ing.product, bottle_id: bottle.id, ml } : null,
        bottle,
        enough,
        afterMl,
      };
    });
  }, [decorated, products, recipe]);

  const [bindings, setBindings] = useState(initialBindings);
  const [pourState, setPourState] = useState<"idle" | "busy" | "done">("idle");
  const [pourError, setPourError] = useState<string | null>(null);

  const allEnough = bindings.every((b) => b.enough);
  const isMakeable = recipe.status === "makeable" && allEnough;

  const onMl = (i: number, ml: number) => {
    setBindings((prev) =>
      prev.map((row, j) => {
        if (j !== i) return row;
        const enough = !!row.bottle && row.bottle.level_ml >= ml;
        const afterMl = row.bottle ? Math.max(0, row.bottle.level_ml - ml) : 0;
        return {
          ...row,
          binding: row.bottle ? { ref: row.ing.product, bottle_id: row.bottle.id, ml } : null,
          enough,
          afterMl,
        };
      }),
    );
  };

  const pour = async () => {
    setPourState("busy");
    setPourError(null);
    try {
      const overrides = bindings
        .filter((b) => b.binding)
        .map((b) => ({ bottle_id: b.binding!.bottle_id, ml: b.binding!.ml }));
      await api.pour({ recipe_id: recipe.id, overrides });
      setPourState("done");
      onToast?.(`logged ${overrides.reduce((s, o) => s + o.ml, 0).toFixed(1)}ml across ${overrides.length} bottles`);
    } catch (e) {
      setPourError(e instanceof Error ? e.message : "pour failed");
      setPourState("idle");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(5,7,10,0.85)",
        backdropFilter: "blur(8px)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 40,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 1080,
          maxHeight: "90vh",
          background: T.surface,
          border: `1px solid ${T.hairline2}`,
          display: "flex",
          overflow: "hidden",
          position: "relative",
          boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            display: "flex",
            gap: 6,
            zIndex: 2,
          }}
        >
          {onEdit ? (
            <HeaderAction label="EDIT" title="edit recipe" onClick={() => onEdit(recipe.raw)} />
          ) : null}
          {onDuplicate ? (
            <HeaderAction label="DUPLICATE" title="duplicate this recipe" onClick={() => onDuplicate(recipe.raw)} />
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            style={{
              width: 30,
              height: 30,
              background: "transparent",
              border: `1px solid ${T.hairline2}`,
              color: T.inkMuted,
              fontFamily: T.mono,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        <div
          style={{
            flex: 1,
            padding: "28px 32px",
            display: "flex",
            flexDirection: "column",
            gap: 18,
            overflow: "auto",
          }}
        >
          <div>
            <div style={{ fontSize: 10, fontFamily: T.mono, color: T.inkMuted, letterSpacing: "0.18em" }}>
              RECIPE · {recipe.family.toUpperCase()} ROOT · {recipe.status.replace("-", " ").toUpperCase()}
            </div>
            <div
              style={{
                fontSize: 42,
                fontWeight: 600,
                color: T.ink,
                letterSpacing: "-0.02em",
                marginTop: 4,
                lineHeight: 1,
              }}
            >
              {recipe.name}
            </div>
            <div
              style={{
                display: "flex",
                gap: 18,
                marginTop: 14,
                fontSize: 12,
                color: T.inkMuted,
                fontFamily: T.mono,
                letterSpacing: "0.06em",
              }}
            >
              <span>
                <span style={{ color: T.inkDim }}>METHOD</span> &nbsp;{recipe.method}
              </span>
              <span>
                <span style={{ color: T.inkDim }}>GLASS</span> &nbsp;{recipe.glass}
              </span>
              <span>
                <span style={{ color: T.inkDim }}>ICE</span> &nbsp;{recipe.ice}
              </span>
              <span>
                <span style={{ color: T.inkDim }}>ABV</span> &nbsp;~{Math.round(recipe.abv * 100)}%
              </span>
              <span>
                <span style={{ color: T.inkDim }}>VOL</span> &nbsp;{total.toFixed(1)}ml
              </span>
            </div>
          </div>

          <Cell title="SPECIFICATION" right={`${recipe.ingredients.length} ingredients`}>
            <div style={{ display: "flex", flexDirection: "column", gap: 0, marginTop: 4 }}>
              {bindings.map((b, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 14,
                    padding: "10px 0",
                    borderBottom: `1px solid ${T.hairline}`,
                  }}
                >
                  <span
                    style={{
                      fontFamily: T.mono,
                      fontSize: 10,
                      color: accent,
                      width: 24,
                      letterSpacing: "0.12em",
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span style={{ fontSize: 15, color: T.ink, fontWeight: 500, width: 160 }}>{b.ing.label}</span>
                  <span style={{ fontSize: 12, color: T.inkMuted, flex: 1, fontStyle: "italic" }}>
                    → {b.bottle?.name ?? "—"}
                  </span>
                  <span style={{ fontFamily: T.mono, fontSize: 13, color: T.ink, fontWeight: 500 }}>
                    {b.ing.amount_ml >= 5 ? `${b.ing.amount_ml}ml` : `${b.ing.amount_ml} dash`}
                  </span>
                  <span
                    style={{
                      fontFamily: T.mono,
                      fontSize: 10,
                      color: b.enough ? T.green : T.red,
                      letterSpacing: "0.12em",
                      width: 90,
                      textAlign: "right",
                    }}
                  >
                    {b.enough ? "✓ ON HAND" : "◯ SHORT"}
                  </span>
                </div>
              ))}
            </div>
          </Cell>

          <Cell title="PREDICTED BALANCE" right="six axes · 0–1">
            <div style={{ display: "flex", gap: 18, padding: "10px 0", alignItems: "flex-end" }}>
              {axes.map((a, i) => (
                <div
                  key={a}
                  style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
                >
                  <div
                    style={{
                      height: 80,
                      width: 24,
                      background: T.surface2,
                      border: `1px solid ${T.hairline2}`,
                      position: "relative",
                      display: "flex",
                      alignItems: "flex-end",
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        height: `${(recipe.balance[i] ?? 0) * 100}%`,
                        background: accent,
                        opacity: 0.85,
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: T.ink, fontFamily: T.mono }}>
                    {Math.round((recipe.balance[i] ?? 0) * 100)}
                  </div>
                  <div
                    style={{
                      fontSize: 9,
                      color: T.inkMuted,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                    }}
                  >
                    {a}
                  </div>
                </div>
              ))}
            </div>
          </Cell>
        </div>

        <div
          style={{
            width: 340,
            background: T.surface2,
            borderLeft: `1px solid ${T.hairline2}`,
            padding: "28px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 18,
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ fontSize: 10, fontFamily: T.mono, color: accent, letterSpacing: "0.18em" }}>POUR BINDING</div>
            <div style={{ fontSize: 22, color: T.ink, fontWeight: 500, marginTop: 4, letterSpacing: "-0.01em" }}>
              Make this drink
            </div>
            <div style={{ fontSize: 12, color: T.inkMuted, marginTop: 6, lineHeight: 1.5 }}>
              Backbar will deplete the bound bottles and log a pour event. Bindings prefer the most-depleted valid bottle.
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, overflow: "auto" }}>
            {bindings.map((b, i) => (
              <div
                key={i}
                style={{
                  padding: "10px 12px",
                  background: T.bg,
                  border: `1px solid ${b.enough ? T.hairline : T.red}`,
                  opacity: b.enough ? 1 : 0.7,
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                  <span
                    style={{
                      fontSize: 12,
                      color: T.ink,
                      flex: 1,
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {b.bottle?.name ?? b.ing.label}
                  </span>
                  <input
                    type="number"
                    value={b.binding?.ml ?? b.ing.amount_ml}
                    onChange={(e) => onMl(i, Math.max(0, Number(e.target.value) || 0))}
                    disabled={pourState !== "idle"}
                    style={{
                      width: 64,
                      background: T.surface,
                      border: `1px solid ${T.hairline2}`,
                      color: accent,
                      fontFamily: T.mono,
                      fontSize: 11,
                      padding: "2px 6px",
                      textAlign: "right",
                      outline: "none",
                    }}
                    aria-label={`${b.ing.label} ml`}
                  />
                  <span style={{ fontFamily: T.mono, fontSize: 11, color: T.inkDim }}>ml</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 10,
                    color: T.inkMuted,
                    fontFamily: T.mono,
                  }}
                >
                  <span>{b.bottle?.level_ml ?? 0}ml</span>
                  <div
                    style={{
                      flex: 1,
                      height: 3,
                      background: T.surface,
                      position: "relative",
                      border: `0.5px solid ${T.hairline2}`,
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        bottom: 0,
                        left: 0,
                        width: `${(b.bottle?.pct ?? 0) * 100}%`,
                        background: T.inkDim,
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        bottom: 0,
                        left: 0,
                        width: `${(b.afterMl / (b.bottle?.full_ml || 1)) * 100}%`,
                        background: accent,
                      }}
                    />
                  </div>
                  <span style={{ color: accent }}>→ {b.afterMl}ml</span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
            {pourError ? (
              <div
                style={{
                  padding: "8px 10px",
                  border: `1px solid ${T.red}`,
                  background: T.redGlow,
                  fontSize: 11,
                  color: T.red,
                  fontFamily: T.mono,
                  letterSpacing: "0.06em",
                }}
              >
                ⚠ {pourError}
              </div>
            ) : null}
            {pourState === "done" ? (
              <div
                style={{
                  padding: "10px 12px",
                  border: `1px solid ${T.green}`,
                  background: T.greenGlow,
                  fontSize: 11,
                  color: T.green,
                  fontFamily: T.mono,
                  letterSpacing: "0.06em",
                }}
              >
                ✓ POUR LOGGED · {bindings.reduce((s, b) => s + (b.binding?.ml ?? 0), 0).toFixed(1)}ml dispensed
              </div>
            ) : null}
            <button
              type="button"
              disabled={!isMakeable || pourState !== "idle"}
              onClick={() => void pour()}
              style={{
                padding: "12px 0",
                background: isMakeable && pourState === "idle" ? accent : T.surface,
                color: isMakeable && pourState === "idle" ? T.bg : T.inkMuted,
                border: "none",
                fontFamily: T.mono,
                fontSize: 13,
                letterSpacing: "0.16em",
                fontWeight: 600,
                cursor: isMakeable && pourState === "idle" ? "pointer" : "not-allowed",
              }}
            >
              {pourState === "done"
                ? "✓ POURED"
                : pourState === "busy"
                  ? "LOGGING…"
                  : isMakeable
                    ? "✦ POUR & LOG"
                    : "SHORT — CANNOT POUR"}
            </button>
            <div style={{ display: "flex", gap: 6 }}>
              {(["RIFF", "HALF", "BATCH"] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  style={{
                    flex: 1,
                    padding: "9px 0",
                    background: "transparent",
                    border: `1px solid ${T.hairline2}`,
                    color: T.inkMuted,
                    fontFamily: T.mono,
                    fontSize: 11,
                    letterSpacing: "0.12em",
                    cursor: "pointer",
                  }}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Header action button — used for EDIT / DUPLICATE next to the close ✕. */
function HeaderAction({
  label,
  title,
  onClick,
}: {
  label: string;
  title: string;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        padding: "0 10px",
        height: 30,
        background: "transparent",
        border: `1px solid ${T.hairline2}`,
        color: T.inkMuted,
        fontFamily: T.mono,
        fontSize: 10,
        letterSpacing: "0.14em",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = T.ink;
        (e.currentTarget as HTMLButtonElement).style.borderColor = T.cyan;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = T.inkMuted;
        (e.currentTarget as HTMLButtonElement).style.borderColor = T.hairline2;
      }}
    >
      {label}
    </button>
  );
}
