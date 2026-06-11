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
        gap: 8,
        flexWrap: "wrap",
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
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
      {actions ? <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>{actions}</div> : null}
    </div>
  );
}

interface Tab {
  id: ViewKey;
  label: string;
  /** Short label for cramped surfaces (bottom nav, mobile top tabs). */
  short: string;
  icon: string;
}

const TABS: Tab[] = [
  { id: "dash", label: "DASH", short: "Dash", icon: "▣" },
  { id: "bottles", label: "BOTTLES", short: "Bottles", icon: "▥" },
  { id: "recipes", label: "RECIPES", short: "Recipes", icon: "▦" },
  { id: "catalog", label: "CATALOG", short: "Catalog", icon: "▤" },
  { id: "pours", label: "POURS", short: "Pours", icon: "▧" },
  { id: "shelf", label: "SHELF", short: "Shelf", icon: "▩" },
  { id: "menu", label: "MENU", short: "Menu", icon: "▨" },
  { id: "settings", label: "SET", short: "Settings", icon: "⚙" },
];

const MOBILE_PRIMARY: readonly ViewKey[] = ["dash", "bottles", "recipes", "catalog"];

interface TopBarProps {
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
  /** Compact mode — when true, the bar collapses to brand + status + search. */
  isMobile?: boolean;
}

/** Top nav bar — clickable, switches the active screen. */
export function TopBar(props: TopBarProps) {
  return props.isMobile ? <MobileTopBar {...props} /> : <DesktopTopBar {...props} />;
}

function DesktopTopBar({
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
}: TopBarProps) {
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

function MobileTopBar({ conn, onOpenPalette, accentColor }: TopBarProps) {
  const liveLabel = conn === "open" ? "LIVE" : conn === "connecting" ? "SYNC" : "OFFLINE";
  const liveColor = conn === "open" ? T.green : conn === "connecting" ? T.amber : T.red;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: "calc(48px + var(--safe-top, 0px))",
        paddingLeft: 14,
        paddingRight: 8,
        paddingTop: "var(--safe-top, 0px)",
        borderBottom: `1px solid ${T.hairline}`,
        background: T.surface,
        position: "relative",
        zIndex: 5,
        flexShrink: 0,
      }}
    >
      <div style={{ width: 8, height: 8, background: accentColor, boxShadow: `0 0 8px ${accentColor}`, flexShrink: 0 }} />
      <div style={{ fontWeight: 600, fontSize: 13, letterSpacing: "0.08em" }}>BACKBAR</div>
      <div style={{ flex: 1 }} />
      <span
        style={{
          fontFamily: T.mono,
          fontSize: 10,
          letterSpacing: "0.08em",
          color: liveColor,
          padding: "2px 6px",
        }}
      >
        {liveLabel}
      </span>
      <button
        type="button"
        onClick={onOpenPalette}
        aria-label="search"
        style={{
          height: 36,
          minWidth: 44,
          padding: "0 12px",
          background: "transparent",
          border: `1px solid ${T.hairline2}`,
          color: T.inkMuted,
          fontFamily: T.mono,
          fontSize: 14,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        ⌕
      </button>
    </div>
  );
}

interface BottomNavProps {
  view: ViewKey;
  onNav(v: ViewKey): void;
  accentColor: string;
  hiddenTabs?: readonly ViewKey[];
}

/**
 * Mobile bottom navigation. Renders the four primary destinations
 * (Dash / Bottles / Recipes / Catalog) plus a "More" sheet for the rest
 * (Pours, Menu, Settings, and Shelf when flag is on).
 */
export function BottomNav({ view, onNav, accentColor, hiddenTabs }: BottomNavProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const allTabs = hiddenTabs?.length ? TABS.filter((t) => !hiddenTabs.includes(t.id)) : TABS;
  const primary = allTabs.filter((t) => MOBILE_PRIMARY.includes(t.id));
  const overflow = allTabs.filter((t) => !MOBILE_PRIMARY.includes(t.id));
  const overflowActive = overflow.some((t) => t.id === view);

  return (
    <>
      <nav
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          paddingBottom: "var(--safe-bottom, 0px)",
          background: T.surface,
          borderTop: `1px solid ${T.hairline}`,
          display: "flex",
          height: "calc(58px + var(--safe-bottom, 0px))",
          zIndex: 30,
        }}
      >
        {primary.map((t) => (
          <BottomTab key={t.id} tab={t} active={view === t.id} accent={accentColor} onClick={() => onNav(t.id)} />
        ))}
        {overflow.length > 0 ? (
          <BottomTab
            tab={{ id: "more" as ViewKey, label: "MORE", short: "More", icon: "···" }}
            active={overflowActive}
            accent={accentColor}
            onClick={() => setMoreOpen(true)}
          />
        ) : null}
      </nav>

      {moreOpen ? (
        <MoreSheet
          tabs={overflow}
          active={view}
          accent={accentColor}
          onPick={(v) => {
            onNav(v);
            setMoreOpen(false);
          }}
          onClose={() => setMoreOpen(false)}
        />
      ) : null}
    </>
  );
}

function BottomTab({
  tab,
  active,
  accent,
  onClick,
}: {
  tab: Tab;
  active: boolean;
  accent: string;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        background: "transparent",
        border: "none",
        borderTop: active ? `2px solid ${accent}` : "2px solid transparent",
        color: active ? T.ink : T.inkMuted,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        cursor: "pointer",
        padding: "4px 2px",
        minHeight: 56,
      }}
    >
      <span style={{ fontSize: 18, fontFamily: T.mono, lineHeight: 1 }}>{tab.icon}</span>
      <span style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>{tab.short}</span>
    </button>
  );
}

function MoreSheet({
  tabs,
  active,
  accent,
  onPick,
  onClose,
}: {
  tabs: Tab[];
  active: ViewKey;
  accent: string;
  onPick(v: ViewKey): void;
  onClose(): void;
}) {
  return (
    <div
      role="dialog"
      aria-modal
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(5,7,10,0.7)",
        zIndex: 40,
        display: "flex",
        alignItems: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          background: T.surface,
          borderTop: `1px solid ${T.hairline}`,
          paddingBottom: "calc(var(--safe-bottom, 0px) + 12px)",
        }}
      >
        <div
          style={{
            padding: "10px 18px 6px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: `1px solid ${T.hairline}`,
          }}
        >
          <span style={{ fontSize: 10, letterSpacing: "0.18em", color: T.inkMuted }}>MORE</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            style={{
              background: "transparent",
              color: T.inkMuted,
              border: `1px solid ${T.hairline2}`,
              width: 30,
              height: 30,
              fontFamily: T.mono,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 1, background: T.hairline }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onPick(t.id)}
              style={{
                background: active === t.id ? T.surface2 : T.surface,
                color: active === t.id ? T.ink : T.inkMuted,
                border: "none",
                padding: "18px 16px",
                display: "flex",
                alignItems: "center",
                gap: 12,
                cursor: "pointer",
                fontFamily: T.body,
                fontSize: 14,
                textAlign: "left",
                borderLeft: active === t.id ? `2px solid ${accent}` : "2px solid transparent",
                minHeight: 56,
              }}
            >
              <span style={{ fontFamily: T.mono, fontSize: 18 }}>{t.icon}</span>
              <span>{t.short}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
