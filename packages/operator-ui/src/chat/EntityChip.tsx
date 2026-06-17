/**
 * Inline reference to an in-Backbar entity (bottle / product / recipe). The
 * agent emits a `[[kind:id]]` token; the client **resolves the id against the
 * live store** (never trusting the model's claim) and renders a chip with a
 * hovercard + click-to-open. Unknown ids degrade to a muted label.
 */
import { useNavigate } from "react-router-dom";
import { Tooltip } from "../console/Tooltip";
import { T, accent } from "../console/tokens";
import { useStore } from "../store/useStore";
import type { EntityKind } from "./types";

interface Resolved {
  label: string;
  rows: { k: string; v: string }[];
  href: string | null;
  ok: boolean;
}

function useResolve(kind: EntityKind, id: string): Resolved {
  const products = useStore((s) => s.products);
  const bottles = useStore((s) => s.bottles);
  const recipes = useStore((s) => s.recipes);
  const makeable = useStore((s) => s.makeable);

  if (kind === "product") {
    const p = products.find((x) => x.id === id);
    if (!p) return miss(id);
    return {
      label: p.name,
      rows: [
        { k: "category", v: p.category },
        ...(p.abv != null ? [{ k: "abv", v: `${Math.round(p.abv * 100)}%` }] : []),
        ...(p.flavor_tags?.length ? [{ k: "tags", v: p.flavor_tags.slice(0, 4).join(", ") }] : []),
      ],
      href: `/catalog/${id}`,
      ok: true,
    };
  }
  if (kind === "bottle") {
    const b = bottles.find((x) => x.id === id);
    if (!b) return miss(id);
    const pct = b.full_ml ? Math.round((b.level_ml / b.full_ml) * 100) : 0;
    return {
      label: b.product?.name ?? id,
      rows: [
        { k: "level", v: `${Math.round(b.level_ml)} / ${b.full_ml} ml (${pct}%)` },
        { k: "status", v: b.status },
      ],
      href: `/bottles/${id}`,
      ok: true,
    };
  }
  const r = recipes.find((x) => x.id === id);
  if (!r) return miss(id);
  const state = makeable.find((m) => m.recipe_id === id)?.state;
  return {
    label: r.name,
    rows: [
      ...(r.family ? [{ k: "family", v: r.family }] : []),
      ...(state ? [{ k: "status", v: state }] : []),
    ],
    href: `/recipes/${id}`,
    ok: true,
  };
}

function miss(id: string): Resolved {
  return { label: id, rows: [], href: null, ok: false };
}

export function EntityChip({ kind, id }: { kind: EntityKind; id: string }) {
  const navigate = useNavigate();
  const tweaks = useStore((s) => s.tweaks);
  const A = accent(tweaks.accent).primary;
  const r = useResolve(kind, id);

  const chip = (
    <span
      onClick={r.href ? () => navigate(r.href!) : undefined}
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 4,
        padding: "0 5px",
        borderRadius: 3,
        border: `1px solid ${r.ok ? T.hairline2 : T.hairline}`,
        background: r.ok ? T.surface2 : "transparent",
        color: r.ok ? T.ink : T.inkMuted,
        cursor: r.href ? "pointer" : "default",
        fontSize: "0.92em",
        lineHeight: 1.4,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ color: A, fontSize: "0.7em", transform: "translateY(-1px)" }}>
        {kind === "recipe" ? "◆" : kind === "bottle" ? "▮" : "●"}
      </span>
      {r.label}
    </span>
  );

  if (!r.ok) return chip;
  return (
    <Tooltip
      content={
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ color: T.ink, fontWeight: 600 }}>{r.label}</div>
          {r.rows.map((row) => (
            <div key={row.k} style={{ display: "flex", gap: 8, fontSize: 11 }}>
              <span style={{ color: T.inkMuted, fontFamily: T.mono, textTransform: "uppercase", minWidth: 56 }}>
                {row.k}
              </span>
              <span style={{ color: T.ink }}>{row.v}</span>
            </div>
          ))}
          {r.href ? (
            <div style={{ color: T.inkDim, fontFamily: T.mono, fontSize: 10, marginTop: 2 }}>
              click to open
            </div>
          ) : null}
        </div>
      }
    >
      {chip}
    </Tooltip>
  );
}
