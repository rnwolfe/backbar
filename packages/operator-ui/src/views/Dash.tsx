/**
 * Dashboard — service overview at-a-glance for the operator.
 *
 * Fully wired to live data: pour cadence chart off /pours/summary, recent
 * pours off /pours, makeable/one-away/low/shopping off the live store,
 * fleet off /nodes.
 */
import { useEffect, useMemo, useState } from "react";
import { api, type PourSummaryDay } from "../api/client";
import type { JoinedRecipe } from "../data/derive";
import { joinRecipes } from "../data/derive";
import { Cell, Pill, Stat } from "../console/Cells";
import { Dot } from "../console/Chrome";
import { T, accent } from "../console/tokens";
import { Tooltip, TooltipRows } from "../console/Tooltip";
import { useStore } from "../store/useStore";
import { decorateMuse } from "../data/synthetic";
import { useViewport } from "../util/useViewport";

type DashPeriod = "tonight" | "week" | "28d";
const DASH_PERIOD_DAYS: Record<DashPeriod, number> = { tonight: 1, week: 7, "28d": 28 };
const DASH_PERIOD_LABEL: Record<DashPeriod, string> = { tonight: "TONIGHT", week: "WEEK", "28d": "28D" };

interface Props {
  onPickRecipe?(r: JoinedRecipe): void;
}

export function Dash({ onPickRecipe }: Props) {
  const tweaks = useStore((s) => s.tweaks);
  const products = useStore((s) => s.products);
  const bottlesRaw = useStore((s) => s.bottles);
  const recipesRaw = useStore((s) => s.recipes);
  const makeable = useStore((s) => s.makeable);
  const nodes = useStore((s) => s.nodes);
  const shopping = useStore((s) => s.shopping);
  const storeSummary = useStore((s) => s.poursSummary);
  const pours = useStore((s) => s.pours);
  const telemetry = useStore((s) => s.telemetry);
  const { isMobile } = useViewport();
  const A = accent(tweaks.accent).primary;

  const [period, setPeriod] = useState<DashPeriod>("28d");
  const [periodSummary, setPeriodSummary] = useState<PourSummaryDay[] | null>(null);

  useEffect(() => {
    // 28d period hits the store cache directly; week/tonight refetch with
    // a smaller window for tighter chart resolution.
    if (period === "28d") {
      setPeriodSummary(null);
      return;
    }
    let alive = true;
    api
      .poursSummary(DASH_PERIOD_DAYS[period])
      .then((s) => {
        if (alive) setPeriodSummary(s);
      })
      .catch(() => {
        if (alive) setPeriodSummary([]);
      });
    return () => {
      alive = false;
    };
  }, [period]);

  const summary = periodSummary ?? storeSummary;

  const joined = useMemo(() => joinRecipes(recipesRaw, makeable, products), [recipesRaw, makeable, products]);
  const makeableList = joined.filter((r) => r.status === "makeable");
  const oneAway = joined.filter((r) => r.status === "one-away");

  const lowBottles = bottlesRaw.filter((b) => b.full_ml > 0 && b.level_ml / b.full_ml < 0.15).length;
  const totalRecipes = joined.length;

  const max = Math.max(1, ...summary.map((d) => d.pours));
  const totals = summary.reduce(
    (acc, d) => ({ pours: acc.pours + d.pours, ml: acc.ml + d.ml }),
    { pours: 0, ml: 0 },
  );

  const muse = decorateMuse(shopping.muse).slice(0, 3);

  // "Recent pours" — last 6h cutoff, formatted hh:mm
  const sixHoursAgo = Date.now() - 6 * 3600 * 1000;
  const recentPours = pours.filter((p) => p.made_at >= sixHoursAgo).slice(0, 8);

  return (
    <div
      style={{
        padding: "14px 16px",
        overflowY: "auto",
        overflowX: "hidden",
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 14,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>Service Overview</div>
          <div style={{ fontSize: 11, color: T.inkMuted, fontFamily: T.mono, marginTop: 2 }}>
            {formatHeader(telemetry?.uptime_days)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {(Object.keys(DASH_PERIOD_LABEL) as DashPeriod[]).map((p) => (
            <Pill key={p} color={A} active={period === p} onClick={() => setPeriod(p)}>
              {DASH_PERIOD_LABEL[p]}
            </Pill>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5,1fr)",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <Stat
          label="POURS TODAY"
          value={(telemetry?.pours_today ?? 0).toString()}
          delta={telemetry?.last_pour_age_s != null ? `${Math.round(telemetry.last_pour_age_s / 60)}m ago` : "—"}
          accent={A}
          density={tweaks.density}
        />
        <Stat
          label="ML · 28D"
          value={totals.ml >= 1000 ? `${(totals.ml / 1000).toFixed(1)}L` : `${Math.round(totals.ml)}ml`}
          delta={`${totals.pours} pours`}
          density={tweaks.density}
        />
        <Stat
          label="MAKEABLE"
          value={`${makeableList.length}/${totalRecipes}`}
          delta={`${totalRecipes ? Math.round((makeableList.length / totalRecipes) * 100) : 0}%`}
          density={tweaks.density}
        />
        <Stat
          label="ONE-AWAY"
          value={oneAway.length.toString()}
          delta="recipes"
          accent={T.amber}
          density={tweaks.density}
        />
        <Stat
          label="LOW BOTTLES"
          value={lowBottles.toString()}
          delta="< 15%"
          accent={T.amber}
          density={tweaks.density}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1.4fr 1fr 1fr",
          gap: 10,
          flex: 1,
          minHeight: 340,
        }}
      >
        <Cell
          title={`POUR CADENCE · ${DASH_PERIOD_LABEL[period]}`}
          right={
            summary.length
              ? `tot ${totals.pours} · avg ${(totals.pours / Math.max(1, summary.length)).toFixed(1)}/d`
              : "—"
          }
        >
          {summary.length === 0 ? (
            <div style={{ padding: "12px 4px", fontSize: 12, color: T.inkMuted }}>
              No pour history yet. Pours logged via the recipe overlay show up here within a second.
            </div>
          ) : (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "flex-end",
                gap: 3,
                position: "relative",
                paddingBottom: 18,
                paddingTop: 14,
              }}
            >
              {summary.map((d, i) => {
                const h = (d.pours / max) * 100;
                const dow = new Date(d.day_start).getDay();
                const isWeekend = dow >= 5;
                const isToday = i === summary.length - 1;
                const dayLabel = new Date(d.day_start).toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                });
                return (
                  <Tooltip
                    key={d.day_start}
                    content={
                      <TooltipRows
                        rows={[
                          { label: "date", value: dayLabel },
                          { label: "pours", value: d.pours.toString() },
                          { label: "volume", value: `${Math.round(d.ml)}ml` },
                          ...(d.top_recipe_name ? [{ label: "top", value: d.top_recipe_name }] : []),
                        ]}
                      />
                    }
                  >
                    <div
                      style={{
                        flex: 1,
                        height: `${h}%`,
                        background: isWeekend ? A : T.cyanDim,
                        opacity: 0.85,
                        position: "relative",
                        cursor: "default",
                      }}
                    >
                      {isToday ? (
                        <div
                          style={{
                            position: "absolute",
                            bottom: "100%",
                            left: "50%",
                            transform: "translateX(-50%)",
                            fontFamily: T.mono,
                            fontSize: 10,
                            color: A,
                            paddingBottom: 4,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {d.pours}
                        </div>
                      ) : null}
                    </div>
                  </Tooltip>
                );
              })}
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  display: "flex",
                  justifyContent: "space-between",
                  fontFamily: T.mono,
                  fontSize: 9,
                  color: T.inkDim,
                }}
              >
                <span>{DASH_PERIOD_DAYS[period]}d ago</span>
                <span>{Math.round(DASH_PERIOD_DAYS[period] / 2)}d</span>
                <span>today</span>
              </div>
            </div>
          )}
        </Cell>

        <Cell title="TONIGHT · MAKEABLE" right={`${makeableList.length}`}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "auto" }}>
            {makeableList.length === 0 ? (
              <div style={{ padding: "8px 0", fontSize: 12, color: T.inkMuted }}>
                Nothing makeable yet. Add some bottles or recipes.
              </div>
            ) : (
              makeableList.map((r) => (
                <div
                  key={r.id}
                  onClick={() => onPickRecipe?.(r)}
                  style={{
                    padding: "7px 0",
                    borderBottom: `1px solid ${T.hairline}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = T.surface2)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Dot status="makeable" />
                    <span style={{ fontSize: 13, color: T.ink }}>{r.name}</span>
                  </div>
                  <span
                    style={{ fontFamily: T.mono, fontSize: 10, color: T.inkDim, letterSpacing: "0.06em" }}
                  >
                    {r.family}
                  </span>
                </div>
              ))
            )}
          </div>
        </Cell>

        <Cell title="RECENT POURS" right="last 6h">
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "auto" }}>
            {recentPours.length === 0 ? (
              <div style={{ padding: "8px 0", fontSize: 12, color: T.inkMuted }}>
                No pours in the last 6 hours.
              </div>
            ) : (
              recentPours.map((p) => (
                <div
                  key={p.id}
                  style={{
                    padding: "8px 0",
                    borderBottom: `1px solid ${T.hairline}`,
                    display: "flex",
                    alignItems: "baseline",
                    gap: 10,
                  }}
                >
                  <span style={{ fontFamily: T.mono, fontSize: 11, color: T.inkDim, width: 42 }}>
                    {formatTime(p.made_at)}
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      color: T.ink,
                      flex: 1,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {p.recipe_name ?? "—"}
                  </span>
                  <span style={{ fontFamily: T.mono, fontSize: 11, color: A }}>{Math.round(p.ml)}ml</span>
                </div>
              ))
            )}
          </div>
        </Cell>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 10, marginTop: 10, height: isMobile ? undefined : 200 }}>
        <Cell title="ONE BOTTLE AWAY" right={`${oneAway.length}`}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "auto" }}>
            {oneAway.length === 0 ? (
              <div style={{ padding: "8px 0", fontSize: 12, color: T.inkMuted }}>
                No one-away recipes — your bar covers the catalog.
              </div>
            ) : (
              oneAway.map((r) => (
                <div
                  key={r.id}
                  onClick={() => onPickRecipe?.(r)}
                  style={{
                    padding: "7px 0",
                    borderBottom: `1px solid ${T.hairline}`,
                    display: "flex",
                    alignItems: "baseline",
                    gap: 10,
                    cursor: "pointer",
                  }}
                >
                  <Dot status="one-away" />
                  <span style={{ fontSize: 13, color: T.ink, flex: 1 }}>{r.name}</span>
                  <span style={{ fontFamily: T.mono, fontSize: 10, color: T.amber }}>{r.one_away ?? "—"}</span>
                </div>
              ))
            )}
          </div>
        </Cell>

        <Cell title="SHOPPING MUSE · AI" right="GW">
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            {muse.length === 0 ? (
              <div style={{ fontSize: 12, color: T.inkMuted }}>Stock is broad — no muse this run.</div>
            ) : (
              muse.map((s) => (
                <div
                  key={s.product}
                  style={{
                    padding: "8px 10px",
                    background: T.surface2,
                    border: `1px solid ${T.hairline}`,
                    display: "flex",
                    alignItems: "baseline",
                    gap: 10,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: T.ink, fontWeight: 500 }}>{s.name}</div>
                    <div style={{ fontSize: 10, color: T.inkMuted, fontFamily: T.mono, marginTop: 2 }}>
                      unlocks {s.unlocks} · {s.price} · {s.store}
                    </div>
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: 13, color: A }}>+{s.unlocks}</div>
                </div>
              ))
            )}
          </div>
        </Cell>

        <Cell title="FLEET" right={`${nodes.length} nodes`}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "auto" }}>
            {nodes.length === 0 ? (
              <div style={{ fontSize: 12, color: T.inkMuted, padding: "4px 0" }}>
                No fleet nodes yet (P0/P1 ships without hardware).
              </div>
            ) : (
              nodes.map((n) => (
                <div
                  key={n.device_id}
                  style={{
                    padding: "6px 0",
                    borderBottom: `1px solid ${T.hairline}`,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <Dot status={n.status} glow={n.status === "online"} />
                  <span style={{ fontSize: 12, color: T.ink, fontFamily: T.mono, flex: 1 }}>
                    {n.label ?? n.device_id}
                  </span>
                  <span
                    style={{
                      fontFamily: T.mono,
                      fontSize: 10,
                      color: n.status === "online" ? T.inkDim : T.red,
                    }}
                  >
                    {n.status === "online" ? `${n.channels_occupied}/${n.channels_total}` : "offline"}
                  </span>
                </div>
              ))
            )}
          </div>
        </Cell>
      </div>
    </div>
  );
}

function formatHeader(uptimeDays: number | null | undefined): string {
  const d = new Date();
  const day = d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short", year: "numeric" });
  return `${day} · live service${uptimeDays ? ` · uptime ${uptimeDays}d` : ""}`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
