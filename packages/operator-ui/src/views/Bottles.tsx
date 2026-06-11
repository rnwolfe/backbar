/**
 * Bottles screen — the hero. Grid | Ribbon | List view toggle.
 * Left rail: category filter w/ counts. Right rail: alerts + shelf telemetry.
 */
import { useEffect, useMemo, useState } from "react";
import {
  BottleGridView,
  BottleListView,
  BottleRibbonView,
} from "../console/BottleViews";
import { Cell, Pill, SectionHead } from "../console/Cells";
import { PageHead } from "../console/Chrome";
import { T, accent } from "../console/tokens";
import {
  catOf,
  decorateBottle,
  type DecoratedBottle,
} from "../data/derive";
import { buildAlerts } from "../data/synthetic";
import { store, useStore } from "../store/useStore";
import { useViewport } from "../util/useViewport";

interface Props {
  onPickBottle?(b: DecoratedBottle): void;
  onAddBottle?(): void;
  onBulkImportPhoto?(): void;
}

type View = "grid" | "ribbon" | "list";

export function Bottles({ onPickBottle, onAddBottle, onBulkImportPhoto }: Props) {
  const tweaks = useStore((s) => s.tweaks);
  const bottlesRaw = useStore((s) => s.bottles);
  const categoriesList = useStore((s) => s.categories);
  const nodes = useStore((s) => s.nodes);
  const telemetry = useStore((s) => s.telemetry);
  const bottlesFilter = useStore((s) => s.bottlesFilter);
  const { isMobile } = useViewport();
  const A = accent(tweaks.accent).primary;

  const decorated = useMemo(() => bottlesRaw.map(decorateBottle), [bottlesRaw]);

  const allCategories = useMemo(() => {
    const seen = new Set<string>();
    for (const b of decorated) seen.add(b.category);
    return Array.from(seen);
  }, [decorated]);

  const [view, setView] = useState<View>(tweaks.defaultBottleView);
  // Re-sync the view if the operator changes the default in the Tweaks panel
  // while this screen is mounted. Without this the radio appears to do nothing.
  useEffect(() => {
    setView(tweaks.defaultBottleView);
  }, [tweaks.defaultBottleView]);
  const [search, setSearch] = useState("");
  const [activeCats, setActiveCats] = useState<Set<string>>(() => new Set<string>());
  const [lowOnly, setLowOnly] = useState(false);
  const [trackedOnly, setTrackedOnly] = useState(false);

  // Default-include any newly-discovered category until the operator explicitly
  // narrows the filter. Keeps the filter UX low-friction when bottles arrive.
  const activeCatsCurrent = useMemo(() => {
    if (activeCats.size === 0 && allCategories.length > 0) return new Set(allCategories);
    return activeCats;
  }, [activeCats, allCategories]);

  const filtered = useMemo(
    () =>
      decorated.filter((b) => {
        if (bottlesFilter && b.raw.product_id !== bottlesFilter.product_id) return false;
        if (!activeCatsCurrent.has(b.category)) return false;
        if (lowOnly && !b.low) return false;
        if (trackedOnly && !b.tracked) return false;
        if (search && !b.name.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      }),
    [decorated, activeCatsCurrent, lowOnly, trackedOnly, search, bottlesFilter],
  );

  const filteredProductName =
    bottlesFilter && decorated.find((b) => b.raw.product_id === bottlesFilter.product_id)?.name;

  const lowCount = decorated.filter((b) => b.low).length;
  const trackedCount = decorated.filter((b) => b.tracked).length;
  const totalMl = decorated.reduce((s, b) => s + b.level_ml, 0);

  const toggleCat = (id: string) => {
    const next = new Set(activeCatsCurrent);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setActiveCats(next);
  };

  const offlineNodes = nodes
    .filter((n) => n.status === "offline")
    .map((n) => ({ device_id: n.device_id, label: n.label }));
  const alerts = buildAlerts(decorated, offlineNodes);

  // The category bar shows up either as a desktop left rail OR as a horizontal
  // pill scroller above the grid on mobile. Same data either way; the
  // wrapping component decides the visual treatment.
  const orderedCategories = [
    ...categoriesList.filter((c) => allCategories.includes(c.id)),
    ...allCategories.filter((id) => !categoriesList.some((c) => c.id === id)).map(catOf),
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        flex: 1,
        minHeight: 0,
        position: "relative",
        zIndex: 1,
      }}
    >
      <aside
        style={{
          width: 200,
          borderRight: `1px solid ${T.hairline}`,
          background: T.surface,
          display: isMobile ? "none" : "flex",
          flexDirection: "column",
          flexShrink: 0,
        }}
      >
        <SectionHead right={`${filtered.length}/${decorated.length}`}>SHELVED</SectionHead>
        <div style={{ padding: "8px 0", flex: 1, overflowY: "auto" }}>
          {[
            ...categoriesList.filter((c) => allCategories.includes(c.id)),
            ...allCategories.filter((id) => !categoriesList.some((c) => c.id === id)).map(catOf),
          ].map((cat) => {
            const list = decorated.filter((b) => b.category === cat.id);
            if (!list.length) return null;
            const low = list.filter((b) => b.low).length;
            const on = activeCatsCurrent.has(cat.id);
            return (
              <div
                key={cat.id}
                onClick={() => toggleCat(cat.id)}
                style={{
                  padding: "5px 16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: 12,
                  color: on ? T.ink : T.inkDim,
                  cursor: "pointer",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      background: on ? `hsl(${cat.hue} 60% 55%)` : T.inkVdim,
                    }}
                  />
                  {cat.label}
                </span>
                <span
                  style={{
                    fontFamily: T.mono,
                    fontSize: 10,
                    color: low && on ? T.amber : T.inkDim,
                  }}
                >
                  {list.length}
                  {low ? ` ·${low}!` : ""}
                </span>
              </div>
            );
          })}
        </div>
        <div style={{ borderTop: `1px solid ${T.hairline}`, padding: "10px 16px" }}>
          <div style={{ fontSize: 10, letterSpacing: "0.14em", color: T.inkMuted, marginBottom: 6 }}>FILTERS</div>
          {(
            [
              { id: "tracked", label: "Tracked only", on: trackedOnly, set: setTrackedOnly, color: T.cyan },
              { id: "low", label: "Low (<15%)", on: lowOnly, set: setLowOnly, color: T.amber },
            ] as const
          ).map((f) => (
            <div
              key={f.id}
              onClick={() => f.set(!f.on)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "4px 0",
                fontSize: 12,
                color: f.on ? f.color : T.ink,
                cursor: "pointer",
              }}
            >
              <span
                style={{
                  width: 11,
                  height: 11,
                  border: `1px solid ${f.on ? f.color : T.inkDim}`,
                  background: f.on ? f.color : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {f.on ? (
                  <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden>
                    <path d="M1 4.5L3.5 7L8 1.5" stroke={T.bg} strokeWidth="1.5" fill="none" />
                  </svg>
                ) : null}
              </span>
              {f.label}
            </div>
          ))}
        </div>
      </aside>

      <div
        style={{
          flex: 1,
          padding: "10px 14px",
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        <PageHead
          title="Bottle Wall"
          meta={`${filtered.length} of ${decorated.length} bottles · ${trackedCount} tracked · ${(totalMl / 1000).toFixed(1)}L on hand · ${lowCount} below threshold`}
          actions={
            <>
              {bottlesFilter ? (
                <button
                  type="button"
                  onClick={() => store.clearBottlesFilter()}
                  title="clear product filter"
                  style={{
                    padding: "4px 10px",
                    fontSize: 11,
                    fontFamily: T.mono,
                    background: T.cyanGlow,
                    color: T.cyan,
                    border: `1px solid ${T.cyan}`,
                    cursor: "pointer",
                    letterSpacing: "0.06em",
                  }}
                >
                  ▾ {filteredProductName ?? bottlesFilter.product_id} ✕
                </button>
              ) : null}
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="search ⌘K"
                style={{
                  background: T.surface2,
                  border: `1px solid ${T.hairline2}`,
                  color: T.ink,
                  fontFamily: T.mono,
                  fontSize: 11,
                  padding: "4px 10px",
                  width: isMobile ? "100%" : 160,
                  minWidth: isMobile ? 0 : undefined,
                  flex: isMobile ? "1 1 100%" : undefined,
                  outline: "none",
                  letterSpacing: "0.04em",
                }}
                aria-label="filter by name"
              />
              <div style={{ display: "flex", border: `1px solid ${T.hairline2}` }}>
                <Pill
                  active={view === "grid"}
                  color={A}
                  onClick={() => setView("grid")}
                  style={{ border: "none", borderRight: `1px solid ${T.hairline2}` }}
                >
                  GRID
                </Pill>
                <Pill
                  active={view === "ribbon"}
                  color={A}
                  onClick={() => setView("ribbon")}
                  style={{ border: "none", borderRight: `1px solid ${T.hairline2}` }}
                >
                  RIBBON
                </Pill>
                <Pill active={view === "list"} color={A} onClick={() => setView("list")} style={{ border: "none" }}>
                  LIST
                </Pill>
              </div>
              <Pill color={A} onClick={onBulkImportPhoto} title="bulk import bottles from shelf photos">
                📷 BULK
              </Pill>
              <Pill color={A} onClick={onAddBottle} title="add a new bottle to inventory">
                + ADD
              </Pill>
            </>
          }
        />

        {isMobile && orderedCategories.length > 0 ? (
          <div
            style={{
              display: "flex",
              gap: 6,
              overflowX: "auto",
              padding: "8px 16px 4px",
              borderBottom: `1px solid ${T.hairline}`,
              scrollbarWidth: "none",
            }}
            // hide native scrollbar on webkit (CSS modules would be cleaner;
            // inline is fine here since this is a one-shot scroller)
          >
            {orderedCategories.map((cat) => {
              const list = decorated.filter((b) => b.category === cat.id);
              if (!list.length) return null;
              const low = list.filter((b) => b.low).length;
              const on = activeCatsCurrent.has(cat.id);
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => toggleCat(cat.id)}
                  style={{
                    flexShrink: 0,
                    padding: "8px 12px",
                    background: on ? T.surface2 : "transparent",
                    border: `1px solid ${on ? `hsl(${cat.hue} 60% 55%)` : T.hairline2}`,
                    color: on ? T.ink : T.inkDim,
                    fontFamily: T.body,
                    fontSize: 12,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      background: `hsl(${cat.hue} 60% 55%)`,
                      opacity: on ? 1 : 0.5,
                    }}
                  />
                  <span>{cat.label}</span>
                  <span style={{ fontFamily: T.mono, fontSize: 10, color: low ? T.amber : T.inkDim }}>
                    {list.length}
                    {low ? ` ·${low}!` : ""}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        <div style={{ flex: 1, minHeight: 0, padding: isMobile ? "10px 14px" : "0 16px" }}>
          {filtered.length === 0 ? (
            <Cell padded>
              <div style={{ padding: "24px 8px", color: T.inkMuted, fontSize: 13 }}>
                No bottles match — try clearing filters or reseed the bar via the SET tab.
              </div>
            </Cell>
          ) : view === "grid" ? (
            <BottleGridView
              bottles={filtered}
              accent={A}
              onPick={onPickBottle}
              columns={isMobile ? 2 : undefined}
            />
          ) : view === "ribbon" ? (
            <BottleRibbonView bottles={filtered} accent={A} onPick={onPickBottle} />
          ) : (
            <BottleListView bottles={filtered} accent={A} onPick={onPickBottle} />
          )}
        </div>
      </div>

      <aside
        style={{
          width: 260,
          borderLeft: `1px solid ${T.hairline}`,
          background: T.surface,
          display: isMobile ? "none" : "flex",
          flexDirection: "column",
          flexShrink: 0,
        }}
      >
        <SectionHead right="LIVE">ALERTS</SectionHead>
        <div style={{ padding: "6px 0", overflowY: "auto", flex: 1 }}>
          {alerts.length === 0 ? (
            <div style={{ padding: "12px 16px", fontSize: 12, color: T.inkMuted }}>All clear.</div>
          ) : (
            alerts.map((a, i) => (
              <div
                key={i}
                style={{
                  padding: "9px 16px",
                  display: "flex",
                  gap: 10,
                  borderBottom: `1px solid ${T.hairline}`,
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{
                    width: 3,
                    alignSelf: "stretch",
                    background: a.sev === "crit" ? T.red : a.sev === "warn" ? T.amber : T.cyan,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: T.ink, fontWeight: 500 }}>{a.label}</div>
                  <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 1 }}>{a.msg}</div>
                </div>
              </div>
            ))
          )}
        </div>
        <div style={{ borderTop: `1px solid ${T.hairline}`, padding: "12px 16px" }}>
          <div style={{ fontSize: 10, letterSpacing: "0.14em", color: T.inkMuted, marginBottom: 8 }}>
            SHELF TELEMETRY
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px 14px",
              fontFamily: T.mono,
              fontSize: 11,
            }}
          >
            <div>
              <div style={{ color: T.inkDim, fontSize: 9, letterSpacing: "0.1em" }}>READINGS/H</div>
              <div style={{ color: A, fontSize: 15 }}>
                {telemetry?.readings_per_hour != null ? telemetry.readings_per_hour.toLocaleString() : "—"}
              </div>
            </div>
            <div>
              <div style={{ color: T.inkDim, fontSize: 9, letterSpacing: "0.1em" }}>UPTIME</div>
              <div style={{ color: T.ink, fontSize: 15 }}>
                {telemetry?.uptime_days != null ? `${telemetry.uptime_days}d` : "—"}
              </div>
            </div>
            <div>
              <div style={{ color: T.inkDim, fontSize: 9, letterSpacing: "0.1em" }}>NODES</div>
              <div style={{ color: T.ink, fontSize: 15 }}>
                {nodes.filter((n) => n.status === "online").length}/{nodes.length || 0}
              </div>
            </div>
            <div>
              <div style={{ color: T.inkDim, fontSize: 9, letterSpacing: "0.1em" }}>POURS TODAY</div>
              <div style={{ color: T.ink, fontSize: 15 }}>{telemetry?.pours_today ?? 0}</div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
