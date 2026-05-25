import { useEffect, useState, type ReactNode } from "react";
import { useDensityScale } from "./density";
import { T } from "./tokens";
import type { ViewKey } from "../store/useStore";
import type { ConnState } from "../api/ws";

/** Subtle dot-grid background — used on every screen so the app feels of-a-piece. */
export function GridBg() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        backgroundImage: `radial-gradient(circle at 1px 1px, ${T.hairline2} 1px, transparent 0)`,
        backgroundSize: "24px 24px",
        opacity: 0.5,
      }}
    />
  );
}

/** Status/severity dot — used in many lists. */
export function Dot({
  status,
  glow = false,
}: {
  status:
    | "ok"
    | "crit"
    | "warn"
    | "info"
    | "makeable"
    | "one-away"
    | "unmakeable"
    | "online"
    | "offline";
  glow?: boolean;
}) {
  const map: Record<typeof status, string> = {
    ok: T.green,
    crit: T.red,
    warn: T.amber,
    info: T.cyan,
    makeable: T.green,
    "one-away": T.amber,
    unmakeable: T.inkDim,
    online: T.green,
    offline: T.red,
  };
  const c = map[status];
  return (
    <div
      style={{
        width: 8,
        height: 8,
        background: c,
        boxShadow: glow ? `0 0 8px ${c}` : "none",
        flex: "0 0 8px",
      }}
    />
  );
}

/** Page header (large heading + meta line + actions row). Density-aware. */
export function PageHead({
  title,
  meta,
  actions,
}: {
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  const scale = useDensityScale();
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        marginBottom: scale.pageHeadGap,
        padding: "0 16px",
      }}
    >
      <div>
        <div
          style={{
            fontSize: scale.pageTitleSize,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            color: T.ink,
          }}
        >
          {title}
        </div>
        {meta ? (
          <div style={{ fontSize: 11, color: T.inkMuted, fontFamily: T.mono, marginTop: 2 }}>{meta}</div>
        ) : null}
      </div>
      {actions ? <div style={{ display: "flex", gap: 6, alignItems: "center" }}>{actions}</div> : null}
    </div>
  );
}

interface Tab {
  id: ViewKey;
  label: string;
}

const TABS: Tab[] = [
  { id: "dash", label: "DASH" },
  { id: "bottles", label: "BOTTLES" },
  { id: "catalog", label: "CATALOG" },
  { id: "recipes", label: "RECIPES" },
  { id: "pours", label: "POURS" },
  { id: "shelf", label: "SHELF" },
  { id: "menu", label: "MENU" },
  { id: "settings", label: "SET" },
];

/** Top nav bar — clickable, switches the active screen. */
export function TopBar({
  view,
  onNav,
  conn,
  onlineNodes,
  totalNodes,
  lowCount,
  showFleetTicker,
  onOpenPalette,
  accentColor,
  hiddenTabs,
}: {
  view: ViewKey;
  onNav(v: ViewKey): void;
  conn: ConnState;
  onlineNodes: number;
  totalNodes: number;
  lowCount: number;
  showFleetTicker: boolean;
  onOpenPalette(): void;
  accentColor: string;
  /** Tab ids to drop from the bar (e.g. shelf when the feature flag is off). */
  hiddenTabs?: readonly ViewKey[];
}) {
  const visibleTabs = hiddenTabs?.length ? TABS.filter((t) => !hiddenTabs.includes(t.id)) : TABS;
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");

  const liveLabel = conn === "open" ? "LIVE" : conn === "connecting" ? "SYNC" : "OFFLINE";
  const liveColor = conn === "open" ? T.ink : conn === "connecting" ? T.amber : T.red;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 0,
        height: 46,
        borderBottom: `1px solid ${T.hairline}`,
        background: T.surface,
        position: "relative",
        zIndex: 5,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: "0 18px",
          borderRight: `1px solid ${T.hairline}`,
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexShrink: 0,
        }}
      >
        <div style={{ width: 8, height: 8, background: accentColor, boxShadow: `0 0 8px ${accentColor}` }} />
        <div style={{ fontWeight: 600, fontSize: 13, letterSpacing: "0.08em" }}>BACKBAR</div>
        <div style={{ fontFamily: T.mono, color: T.inkDim, fontSize: 11 }}>v0.4.1</div>
      </div>

      {visibleTabs.map((t) => {
        const active = t.id === view;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onNav(t.id)}
            style={{
              padding: "0 16px",
              height: "100%",
              display: "flex",
              alignItems: "center",
              fontSize: 12,
              letterSpacing: "0.06em",
              fontFamily: T.body,
              color: active ? T.ink : T.inkMuted,
              background: active ? T.surface2 : "transparent",
              borderRight: `1px solid ${T.hairline}`,
              borderTop: "none",
              borderLeft: "none",
              borderBottom: "none",
              position: "relative",
              cursor: "pointer",
            }}
          >
            {t.label}
            {active ? (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: -1,
                  height: 1,
                  background: accentColor,
                }}
              />
            ) : null}
          </button>
        );
      })}

      <div style={{ flex: 1 }} />

      <button
        type="button"
        onClick={onOpenPalette}
        style={{
          height: "100%",
          padding: "0 14px",
          background: "transparent",
          border: "none",
          borderLeft: `1px solid ${T.hairline}`,
          color: T.inkMuted,
          fontSize: 11,
          fontFamily: T.mono,
          letterSpacing: "0.06em",
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: "pointer",
        }}
        aria-label="open command palette"
        aria-keyshortcuts="Meta+K Control+K"
      >
        <span
          style={{
            padding: "2px 6px",
            border: `1px solid ${T.hairline2}`,
            color: T.inkMuted,
            fontSize: 10,
          }}
        >
          ⌘K
        </span>
        <span>search</span>
      </button>

      {showFleetTicker ? (
        <div
          style={{
            padding: "0 14px",
            height: "100%",
            display: "flex",
            alignItems: "center",
            gap: 14,
            borderLeft: `1px solid ${T.hairline}`,
            fontFamily: T.mono,
            fontSize: 11,
            color: T.inkMuted,
            flexShrink: 0,
          }}
        >
          <span>
            <span style={{ color: T.green }}>●</span> {onlineNodes}/{totalNodes} NODES
          </span>
          <span>
            <span style={{ color: lowCount > 0 ? T.amber : T.inkDim }}>●</span> {lowCount} LOW
          </span>
          <span style={{ color: liveColor }}>{liveLabel}</span>
          <span style={{ color: T.ink }}>
            {hh}:{mm}:{ss}
          </span>
        </div>
      ) : (
        <div
          style={{
            padding: "0 14px",
            height: "100%",
            display: "flex",
            alignItems: "center",
            gap: 14,
            borderLeft: `1px solid ${T.hairline}`,
            fontFamily: T.mono,
            fontSize: 11,
            color: T.inkMuted,
            flexShrink: 0,
          }}
        >
          <span style={{ color: liveColor }}>{liveLabel}</span>
        </div>
      )}
    </div>
  );
}
