import type { CSSProperties, ReactNode } from "react";
import { useDensityScale } from "./density";
import { T } from "./tokens";

/** Tabular small-cap section header — used in left/right rails and inside cells. */
export function SectionHead({
  children,
  right,
  style,
}: {
  children: ReactNode;
  right?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        padding: "10px 16px 6px",
        borderBottom: `1px solid ${T.hairline}`,
        ...style,
      }}
    >
      <div style={{ fontSize: 11, letterSpacing: "0.14em", color: T.inkMuted, fontWeight: 500 }}>{children}</div>
      {right ? <div style={{ fontSize: 11, fontFamily: T.mono, color: T.inkDim }}>{right}</div> : null}
    </div>
  );
}

/**
 * Stat block — big mono number + small label/delta. Padding and number size
 * follow the active Density (see `console/density.tsx`). The `density` prop
 * is accepted for back-compat but the context value wins when provided.
 */
export function Stat({
  label,
  value,
  delta,
  accent,
}: {
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  accent?: string;
  /** @deprecated density now comes from DensityContext; prop ignored. */
  density?: "compact" | "regular" | "comfy";
}) {
  const scale = useDensityScale();
  return (
    <div
      style={{
        padding: scale.statPad,
        background: T.surface,
        border: `1px solid ${T.hairline}`,
        position: "relative",
      }}
    >
      <div style={{ fontSize: 10, letterSpacing: "0.14em", color: T.inkMuted }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
        <div
          style={{
            fontFamily: T.mono,
            fontSize: scale.statSize,
            color: accent ?? T.ink,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            lineHeight: 1,
          }}
        >
          {value}
        </div>
        {delta ? <div style={{ fontFamily: T.mono, fontSize: 11, color: T.inkMuted }}>{delta}</div> : null}
      </div>
    </div>
  );
}

/** Pill button — segmented look, used for view toggles, filters, actions. */
export function Pill({
  children,
  active,
  color,
  onClick,
  style,
  disabled,
  title,
}: {
  children: ReactNode;
  active?: boolean;
  color?: string;
  onClick?: () => void;
  style?: CSSProperties;
  disabled?: boolean;
  title?: string;
}) {
  const c = color ?? T.cyan;
  const glow =
    c === T.amber ? T.amberGlow : c === T.green ? T.greenGlow : c === T.red ? T.redGlow : T.cyanGlow;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: "5px 11px",
        fontSize: 11,
        fontFamily: T.mono,
        letterSpacing: "0.06em",
        background: active ? glow : "transparent",
        color: active ? c : T.inkMuted,
        border: `1px solid ${active ? c : T.hairline2}`,
        borderRadius: 0,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        fontWeight: active ? 500 : 400,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/** Bordered surface block with optional title strip — the workhorse container. */
export function Cell({
  title,
  right,
  children,
  style,
  padded = true,
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
  padded?: boolean;
}) {
  const scale = useDensityScale();
  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${T.hairline}`,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        minHeight: 0,
        ...style,
      }}
    >
      {title ? (
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            padding: "10px 14px 8px",
            borderBottom: `1px solid ${T.hairline}`,
          }}
        >
          <div style={{ fontSize: 10, letterSpacing: "0.18em", color: T.inkMuted, fontWeight: 500 }}>{title}</div>
          {right ? <div style={{ fontSize: 10, fontFamily: T.mono, color: T.inkDim }}>{right}</div> : null}
        </div>
      ) : null}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          padding: padded ? scale.cellPad : 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Hairline rule — vertical when `vertical` is set. */
export function Rule({ vertical, color }: { vertical?: boolean; color?: string }) {
  return (
    <div
      style={{
        flex: vertical ? "0 0 1px" : "1 1 auto",
        height: vertical ? "100%" : 1,
        width: vertical ? 1 : "auto",
        background: color ?? T.hairline,
      }}
    />
  );
}
