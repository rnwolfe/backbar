/**
 * Slide-out preferences panel — accent color, default bottle view, density,
 * fleet ticker. Values persist to localStorage via the store.
 */
import { useState, type ReactNode } from "react";
import { useDensityScale } from "./density";
import { T } from "./tokens";
import { store, useStore, type Tweaks } from "../store/useStore";

const ACCENTS: Tweaks["accent"][] = ["cyan", "amber", "green"];
const VIEWS: Tweaks["defaultBottleView"][] = ["grid", "ribbon", "list"];
const DENSITIES: Tweaks["density"][] = ["compact", "regular", "comfy"];

export function TweaksPanel() {
  const tweaks = useStore((s) => s.tweaks);
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Trigger tab — bottom right edge */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed",
          bottom: 14,
          right: open ? 318 : 14,
          padding: "8px 12px",
          background: T.surface,
          border: `1px solid ${T.hairline2}`,
          color: T.inkMuted,
          fontFamily: T.mono,
          fontSize: 11,
          letterSpacing: "0.14em",
          cursor: "pointer",
          zIndex: 30,
          transition: "right 0.16s ease",
        }}
        aria-expanded={open}
        aria-label="open tweaks panel"
      >
        TWEAKS
      </button>

      <aside
        aria-label="tweaks"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 304,
          background: T.surface,
          borderLeft: `1px solid ${T.hairline2}`,
          zIndex: 28,
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.18s ease",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "14px 18px",
            borderBottom: `1px solid ${T.hairline}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.08em" }}>TWEAKS</div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            style={{
              background: "transparent",
              border: "none",
              color: T.inkMuted,
              fontFamily: T.mono,
              fontSize: 14,
              cursor: "pointer",
            }}
            aria-label="close tweaks"
          >
            ✕
          </button>
        </div>

        <div style={{ overflow: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
          <Section label="Accent" />
          <Radio<Tweaks["accent"]>
            label="Signal color"
            value={tweaks.accent}
            options={ACCENTS}
            onChange={(v) => store.setTweak("accent", v)}
          />

          <Section label="Bottles view" />
          <Radio<Tweaks["defaultBottleView"]>
            label="Default"
            value={tweaks.defaultBottleView}
            options={VIEWS}
            onChange={(v) => store.setTweak("defaultBottleView", v)}
          />

          <Section label="Chrome" />
          <Toggle
            label="Show fleet ticker in topbar"
            value={tweaks.showFleetTickerInTopBar}
            onChange={(v) => store.setTweak("showFleetTickerInTopBar", v)}
          />

          <Section label="Density" />
          <Radio<Tweaks["density"]>
            label=""
            value={tweaks.density}
            options={DENSITIES}
            onChange={(v) => store.setTweak("density", v)}
          />
          <DensityPreview />
        </div>
      </aside>
    </>
  );
}

/**
 * Live preview block so the operator gets immediate visual feedback when
 * they change density inside the panel itself — without having to peek
 * behind the slide-out to see Cells/Stats on the page below resize.
 */
function DensityPreview() {
  const scale = useDensityScale();
  return (
    <div
      style={{
        padding: scale.cellPad,
        background: T.surface2,
        border: `1px solid ${T.hairline2}`,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        transition: "padding 0.12s ease",
      }}
      aria-label="density preview"
    >
      <div style={{ fontSize: 10, letterSpacing: "0.18em", color: T.inkMuted }}>PREVIEW</div>
      <div
        style={{
          fontFamily: T.mono,
          fontSize: scale.statSize,
          color: T.cyan,
          letterSpacing: "-0.02em",
          lineHeight: 1,
          transition: "font-size 0.12s ease",
        }}
      >
        42
      </div>
      <div style={{ fontFamily: T.mono, fontSize: 10, color: T.inkDim }}>
        cell {scale.cellPad} · stat {scale.statSize}px
      </div>
    </div>
  );
}

function Section({ label }: { label: string }) {
  return (
    <div
      style={{
        fontSize: 10,
        letterSpacing: "0.18em",
        color: T.inkMuted,
        marginTop: 4,
        paddingBottom: 4,
        borderBottom: `1px solid ${T.hairline}`,
      }}
    >
      {label.toUpperCase()}
    </div>
  );
}

function Radio<V extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: V;
  options: V[];
  onChange(v: V): void;
}): ReactNode {
  return (
    <div>
      {label ? (
        <div style={{ fontSize: 11, color: T.inkMuted, marginBottom: 6 }}>{label}</div>
      ) : null}
      <div style={{ display: "flex", border: `1px solid ${T.hairline2}` }}>
        {options.map((opt, i) => (
          <button
            key={String(opt)}
            type="button"
            onClick={() => onChange(opt)}
            style={{
              flex: 1,
              padding: "7px 0",
              background: opt === value ? T.cyanGlow : "transparent",
              color: opt === value ? T.ink : T.inkMuted,
              fontFamily: T.mono,
              fontSize: 11,
              letterSpacing: "0.08em",
              border: "none",
              borderRight: i < options.length - 1 ? `1px solid ${T.hairline2}` : "none",
              cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange(v: boolean): void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        cursor: "pointer",
        fontSize: 12,
        color: T.ink,
      }}
    >
      <span
        style={{
          width: 13,
          height: 13,
          border: `1px solid ${value ? T.cyan : T.inkDim}`,
          background: value ? T.cyan : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {value ? (
          <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden>
            <path d="M1 4.5L3.5 7L8 1.5" stroke={T.bg} strokeWidth="1.5" fill="none" />
          </svg>
        ) : null}
      </span>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
        aria-label={label}
      />
      <span>{label}</span>
    </label>
  );
}
