/**
 * Prep — the reusable made-ingredient library (orgeats, syrups, infusions).
 * Components are referenced by recipes as a single build line; here you browse,
 * create, edit, and delete them. "Used by" is derived from the recipe store.
 */
import { useMemo } from "react";
import type { Component } from "@backbar/core";
import { api } from "../api/client";
import { PageHead } from "../console/Chrome";
import { T, accent } from "../console/tokens";
import { store, useStore } from "../store/useStore";
import { useViewport } from "../util/useViewport";

interface Props {
  onAddComponent?(): void;
  onEditComponent?(c: Component): void;
  onToast?(text: string): void;
}

export function Components({ onAddComponent, onEditComponent, onToast }: Props) {
  const components = useStore((s) => s.components);
  const recipes = useStore((s) => s.recipes);
  const tweaks = useStore((s) => s.tweaks);
  const A = accent(tweaks.accent).primary;
  const { isMobile } = useViewport();

  async function toggleOnHand(c: Component) {
    try {
      await api.patchComponent(c.id, { on_hand: !c.on_hand });
      await store.refreshComponents();
      onToast?.(`${c.name} · ${!c.on_hand ? "on hand" : "out"}`);
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : "toggle failed");
    }
  }

  // component id → recipe names that reference it.
  const usedBy = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of recipes) {
      for (const ing of r.ingredients) {
        if (ing.ref_type === "component" && ing.ref_id) {
          const list = m.get(ing.ref_id) ?? [];
          if (!list.includes(r.name)) list.push(r.name);
          m.set(ing.ref_id, list);
        }
      }
    }
    return m;
  }, [recipes]);

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: "auto", width: "100%" }}>
      <PageHead
        title="Prep"
        meta={`${components.length} component${components.length === 1 ? "" : "s"} · reusable made-ingredients`}
        actions={
          <button
            type="button"
            onClick={onAddComponent}
            style={{
              height: 32,
              padding: "0 14px",
              background: "transparent",
              border: `1px solid ${A}`,
              color: A,
              fontFamily: T.mono,
              fontSize: 11,
              letterSpacing: "0.1em",
              cursor: "pointer",
            }}
          >
            + COMPONENT
          </button>
        }
      />

      {components.length === 0 ? (
        <div style={{ padding: "48px 24px", textAlign: "center", color: T.inkMuted, fontSize: 14, lineHeight: 1.6 }}>
          No components yet. Add an orgeat, syrup, or infusion — or import a recipe whose homemade
          ingredient will create one automatically.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 12,
            padding: 16,
          }}
        >
          {components.map((c) => {
            const used = usedBy.get(c.id) ?? [];
            const needsPrep = c.blocks_makeability && !c.on_hand;
            return (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => onEditComponent?.(c)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onEditComponent?.(c);
                }}
                style={{
                  textAlign: "left",
                  background: T.surface,
                  border: `1px solid ${T.hairline2}`,
                  borderLeft: `3px solid ${needsPrep ? T.amber : A}`,
                  padding: "12px 14px",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: T.ink, flex: 1 }}>{c.name}</span>
                  {c.kind ? (
                    <span style={{ fontSize: 9, fontFamily: T.mono, color: T.cyan, letterSpacing: "0.12em" }}>
                      {c.kind.toUpperCase()}
                    </span>
                  ) : null}
                </div>
                <div style={{ fontSize: 11, fontFamily: T.mono, color: T.inkMuted, lineHeight: 1.5 }}>
                  {c.ingredients
                    .slice(0, 4)
                    .map((i) => i.label ?? i.ref_id)
                    .join(" · ") || "no ingredients"}
                  {c.ingredients.length > 4 ? ` +${c.ingredients.length - 4}` : ""}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 10, fontFamily: T.mono, color: T.inkDim }}>
                  {c.keeps ? <span>keeps {c.keeps}</span> : null}
                  <span style={{ color: used.length ? T.inkMuted : T.inkDim }}>
                    {used.length ? `used in ${used.length}` : "unused"}
                  </span>
                  {c.blocks_makeability ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void toggleOnHand(c);
                      }}
                      title="toggle whether a batch is on hand (gates makeability of recipes using it)"
                      style={{
                        marginLeft: "auto",
                        padding: "2px 8px",
                        background: c.on_hand ? T.cyanGlow : T.amberGlow,
                        border: `1px solid ${c.on_hand ? T.cyan : T.amberDim}`,
                        color: c.on_hand ? T.cyan : T.amber,
                        fontFamily: T.mono,
                        fontSize: 9,
                        letterSpacing: "0.1em",
                        cursor: "pointer",
                      }}
                    >
                      {c.on_hand ? "● ON HAND" : "○ NEEDS PREP"}
                    </button>
                  ) : (
                    <span style={{ marginLeft: "auto", color: T.inkDim }}>non-blocking</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
