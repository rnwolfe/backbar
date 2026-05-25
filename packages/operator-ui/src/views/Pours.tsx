/**
 * Pour history / depletion analytics — wired to /pours/* and /telemetry.
 *
 * Period toggle (week / 28d / quarter) refetches the three pour endpoints
 * with the chosen window. Export CSV downloads the active summary as a
 * client-side blob (no server round-trip needed). Charts carry rich title
 * tooltips for hover-detail.
 */
import { useEffect, useMemo, useState } from "react";
import {
  api,
  type PourSummaryDay,
  type TopBottleRow,
  type TopRecipeRow,
} from "../api/client";
import { Cell, Pill, Stat } from "../console/Cells";
import { PageHead } from "../console/Chrome";
import { T, accent } from "../console/tokens";
import { Tooltip, TooltipRows } from "../console/Tooltip";
import { useStore } from "../store/useStore";

type Period = "week" | "28d" | "quarter";

const PERIOD_DAYS: Record<Period, number> = { week: 7, "28d": 28, quarter: 90 };
const PERIOD_LABEL: Record<Period, string> = { week: "WEEK", "28d": "28D", quarter: "QUARTER" };

export function Pours() {
  const tweaks = useStore((s) => s.tweaks);
  const bottlesRaw = useStore((s) => s.bottles);
  const telemetry = useStore((s) => s.telemetry);
  const A = accent(tweaks.accent).primary;

  const [period, setPeriod] = useState<Period>("28d");
  const [summary, setSummary] = useState<PourSummaryDay[]>([]);
  const [topRecipes, setTopRecipes] = useState<TopRecipeRow[]>([]);
  const [topBottles, setTopBottles] = useState<TopBottleRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Refetch the analytics triplet whenever the period changes. Initial load
  // hydrates off the store (which uses 28d), so the first paint isn't blank.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    const days = PERIOD_DAYS[period];
    Promise.all([
      api.poursSummary(days).catch(() => [] as PourSummaryDay[]),
      api.poursTopRecipes(days).catch(() => [] as TopRecipeRow[]),
      api.poursTopBottles(days).catch(() => [] as TopBottleRow[]),
    ]).then(([s, r, b]) => {
      if (!alive) return;
      setSummary(s);
      setTopRecipes(r);
      setTopBottles(b);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [period]);

  const totals = useMemo(
    () =>
      summary.reduce(
        (acc, d) => ({ pours: acc.pours + d.pours, ml: acc.ml + d.ml }),
        { pours: 0, ml: 0 },
      ),
    [summary],
  );

  const max = Math.max(1, ...summary.map((d) => d.pours));
  const maxMl = Math.max(1, ...summary.map((d) => d.ml));

  const weekdayBuckets = useMemo(() => {
    const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const out = labels.map((d) => ({ day: d, pours: 0, ml: 0 }));
    for (const d of summary) {
      const dow = new Date(d.day_start).getDay();
      out[dow]!.pours += d.pours;
      out[dow]!.ml += d.ml;
    }
    return out;
  }, [summary]);

  const todayIndex = summary.length - 1;

  const bottlesById = useMemo(() => {
    const m = new Map<string, { name: string }>();
    for (const b of bottlesRaw) m.set(b.id, { name: b.product?.name ?? b.product_id });
    return m;
  }, [bottlesRaw]);

  const exportCsv = () => {
    const lines: string[] = [];
    lines.push("# pour_summary — days, pours, ml, top_recipe");
    lines.push("day_start_iso,pours,ml,top_recipe");
    for (const d of summary) {
      const iso = new Date(d.day_start).toISOString().slice(0, 10);
      lines.push(`${iso},${d.pours},${d.ml},${escapeCsv(d.top_recipe_name ?? "")}`);
    }
    lines.push("");
    lines.push("# top_recipes — recipe_id, recipe_name, count, ml");
    lines.push("recipe_id,recipe_name,count,ml");
    for (const r of topRecipes) {
      lines.push(`${r.recipe_id},${escapeCsv(r.recipe_name)},${r.count},${r.ml}`);
    }
    lines.push("");
    lines.push("# top_bottles — bottle_id, name, ml");
    lines.push("bottle_id,bottle_name,ml");
    for (const b of topBottles) {
      lines.push(`${b.bottle_id},${escapeCsv(bottlesById.get(b.bottle_id)?.name ?? b.bottle_id)},${b.ml}`);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backbar-pours-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      style={{
        padding: "14px 16px",
        overflow: "auto",
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        minHeight: 0,
      }}
    >
      <PageHead
        title="Pour History"
        meta={`${PERIOD_DAYS[period]} days · ${totals.pours} pours · ${(totals.ml / 1000).toFixed(1)}L dispensed${
          telemetry ? ` · today ${telemetry.pours_today}` : ""
        }${loading ? " · refreshing…" : ""}`}
        actions={
          <>
            {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
              <Pill key={p} color={A} active={period === p} onClick={() => setPeriod(p)}>
                {PERIOD_LABEL[p]}
              </Pill>
            ))}
            <Pill onClick={exportCsv} title={`download ${PERIOD_DAYS[period]}d analytics as CSV`}>
              EXPORT CSV
            </Pill>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, padding: "0 16px" }}>
        <Stat label="POURS" value={totals.pours.toString()} delta={`over ${PERIOD_DAYS[period]}d`} accent={A} />
        <Stat
          label="VOLUME"
          value={totals.ml >= 1000 ? `${(totals.ml / 1000).toFixed(1)}L` : `${Math.round(totals.ml)}ml`}
          delta={`${Math.round(totals.ml)} ml total`}
        />
        <Stat
          label="UNIQUE BOTTLES"
          value={topBottles.length.toString()}
          delta={`of ${bottlesRaw.length} shelved`}
        />
        <Stat
          label="POURS TODAY"
          value={(telemetry?.pours_today ?? 0).toString()}
          delta={telemetry?.last_pour_age_s != null ? `${Math.round(telemetry.last_pour_age_s / 60)}m ago` : "—"}
        />
      </div>

      {summary.length === 0 ? (
        <Cell padded style={{ margin: "0 16px" }}>
          <div style={{ padding: "32px 8px", fontSize: 13, color: T.inkMuted, textAlign: "center" }}>
            No pour history in this window. Log a pour from the Recipes screen — it'll show up within a second.
          </div>
        </Cell>
      ) : (
        <Cell
          title="DAILY · POURS BY VOLUME"
          right={`live · ${summary.length}d window · hover for detail`}
          style={{ minHeight: 280, margin: "0 16px" }}
        >
          <div
            style={{
              flex: 1,
              position: "relative",
              display: "flex",
              alignItems: "flex-end",
              gap: 6,
              paddingTop: 18,
              paddingBottom: 22,
            }}
          >
            <div style={{ position: "absolute", left: 0, right: 0, top: 18, bottom: 22, pointerEvents: "none" }}>
              {[0.25, 0.5, 0.75, 1].map((t) => (
                <div
                  key={t}
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: `${(1 - t) * 100}%`,
                    height: 1,
                    background: T.hairline,
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      left: 0,
                      top: -7,
                      fontSize: 9,
                      color: T.inkDim,
                      background: T.surface,
                      paddingRight: 4,
                      fontFamily: T.mono,
                    }}
                  >
                    {((maxMl * t) / 1000).toFixed(1)}L
                  </span>
                </div>
              ))}
            </div>
            {summary.map((d, i) => {
              const h = (d.ml / maxMl) * 100;
              const dow = new Date(d.day_start).getDay();
              const isWknd = dow >= 5;
              const isToday = i === todayIndex;
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
                        ...(isToday ? [{ label: "marker", value: "today" }] : []),
                      ]}
                    />
                  }
                >
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      position: "relative",
                      height: "100%",
                      cursor: "default",
                    }}
                  >
                    <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end" }}>
                      <div
                        style={{
                          width: "100%",
                          height: `${h}%`,
                          background: isWknd ? A : T.cyanDim,
                          opacity: isWknd ? 0.92 : 0.7,
                          position: "relative",
                        }}
                      >
                        {isToday ? (
                          <div
                            style={{
                              position: "absolute",
                              top: -2,
                              left: 0,
                              right: 0,
                              height: 2,
                              background: A,
                            }}
                          />
                        ) : null}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 9,
                        color: isToday ? A : T.inkDim,
                        marginTop: 6,
                        fontFamily: T.mono,
                        position: "absolute",
                        top: "100%",
                      }}
                    >
                      {isToday ? "today" : i % 7 === 0 ? `−${summary.length - 1 - i}d` : ""}
                    </div>
                  </div>
                </Tooltip>
              );
            })}
          </div>
        </Cell>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, height: 240, padding: "0 16px" }}>
        <Cell title="BY WEEKDAY" right="pours">
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "flex-end",
              gap: 6,
              paddingTop: 8,
              paddingBottom: 18,
              position: "relative",
            }}
          >
            {weekdayBuckets.map((b) => {
              const m = Math.max(1, ...weekdayBuckets.map((x) => x.pours));
              const h = (b.pours / m) * 100;
              const isWknd = b.day === "Sat" || b.day === "Sun" || b.day === "Fri";
              return (
                <Tooltip
                  key={b.day}
                  content={
                    <TooltipRows
                      rows={[
                        { label: "weekday", value: b.day },
                        { label: "pours", value: b.pours.toString() },
                        { label: "volume", value: `${Math.round(b.ml)}ml` },
                      ]}
                    />
                  }
                >
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 4,
                      height: "100%",
                      cursor: "default",
                    }}
                  >
                    <div style={{ fontFamily: T.mono, fontSize: 10, color: isWknd ? A : T.inkMuted }}>{b.pours}</div>
                    <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end" }}>
                      <div
                        style={{
                          width: "100%",
                          height: `${h}%`,
                          background: isWknd ? A : T.cyanDim,
                          opacity: isWknd ? 0.92 : 0.7,
                        }}
                      />
                    </div>
                    <div
                      style={{
                        fontFamily: T.mono,
                        fontSize: 9,
                        color: T.inkDim,
                        position: "absolute",
                        bottom: 0,
                        transform: "translateY(4px)",
                      }}
                    >
                      {b.day.slice(0, 2).toUpperCase()}
                    </div>
                  </div>
                </Tooltip>
              );
            })}
          </div>
        </Cell>

        <Cell title="TOP RECIPES" right={`${PERIOD_DAYS[period]}d · ${topRecipes.length}`}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7, paddingTop: 4, overflow: "auto" }}>
            {topRecipes.length === 0 ? (
              <div style={{ fontSize: 12, color: T.inkMuted, padding: "8px 0" }}>—</div>
            ) : (
              topRecipes.slice(0, 8).map((r) => {
                const avgMl = r.count > 0 ? r.ml / r.count : 0;
                return (
                  <Tooltip
                    key={r.recipe_id}
                    content={
                      <TooltipRows
                        rows={[
                          { label: "recipe", value: r.recipe_name },
                          { label: "id", value: r.recipe_id },
                          { label: "pours", value: r.count.toString() },
                          { label: "volume", value: `${Math.round(r.ml)}ml total` },
                          { label: "avg", value: `${Math.round(avgMl)}ml / pour` },
                        ]}
                      />
                    }
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, cursor: "default" }}>
                      <span
                        style={{
                          color: T.ink,
                          width: 120,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {r.recipe_name}
                      </span>
                      <div
                        style={{
                          flex: 1,
                          height: 8,
                          background: T.surface2,
                          position: "relative",
                          border: `1px solid ${T.hairline2}`,
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            top: 0,
                            bottom: 0,
                            left: 0,
                            width: `${(r.count / (topRecipes[0]?.count || 1)) * 100}%`,
                            background: A,
                            opacity: 0.85,
                          }}
                        />
                      </div>
                      <span style={{ fontFamily: T.mono, fontSize: 11, color: A, width: 24, textAlign: "right" }}>
                        {r.count}×
                      </span>
                    </div>
                  </Tooltip>
                );
              })
            )}
          </div>
        </Cell>

        <Cell title="MOST-POURED BOTTLES" right={`${PERIOD_DAYS[period]}d · ml`}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, paddingTop: 4, overflow: "auto" }}>
            {topBottles.length === 0 ? (
              <div style={{ fontSize: 12, color: T.inkMuted, padding: "8px 0" }}>—</div>
            ) : (
              topBottles.slice(0, 8).map((b, i) => {
                const name = bottlesById.get(b.bottle_id)?.name ?? b.bottle_id;
                return (
                  <Tooltip
                    key={b.bottle_id}
                    content={
                      <TooltipRows
                        rows={[
                          { label: "bottle", value: name },
                          { label: "id", value: b.bottle_id },
                          { label: "volume", value: `${Math.round(b.ml)}ml dispensed` },
                          { label: "window", value: `${PERIOD_DAYS[period]} days` },
                        ]}
                      />
                    }
                  >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "default" }}
                  >
                    <span style={{ fontFamily: T.mono, fontSize: 9, color: T.inkDim, width: 16 }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      style={{
                        color: T.ink,
                        flex: 1,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {name}
                    </span>
                    <span style={{ fontFamily: T.mono, fontSize: 11, color: T.inkMuted }}>
                      {Math.round(b.ml)}
                      <span style={{ color: T.inkDim }}>ml</span>
                    </span>
                  </div>
                  </Tooltip>
                );
              })
            )}
          </div>
        </Cell>
      </div>
    </div>
  );
}

function escapeCsv(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
