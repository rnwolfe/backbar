/**
 * Bottle detail overlay — fetches /bottles/:id/detail for real sparkline,
 * 28-day stats, and calibration. While the request is in-flight, falls back
 * to the cached decorated bottle so the modal opens snappily.
 */
import { useEffect, useMemo, useState } from "react";
import { Cell, Pill, Stat } from "../Cells";
import { Dot } from "../Chrome";
import { T } from "../tokens";
import { Tooltip, TooltipRows } from "../Tooltip";
import { api, type BottleDetail, type ProductTagRow } from "../../api/client";
import type { DecoratedBottle, JoinedRecipe } from "../../data/derive";
import { catOf, joinRecipes } from "../../data/derive";
import { useStore } from "../../store/useStore";

export function BottleDetailOverlay({
  bottle,
  onClose,
  accent,
  onTare,
  onPickProduct,
  onEdit,
  onDuplicate,
}: {
  bottle: DecoratedBottle;
  onClose(): void;
  accent: string;
  onTare?(b: DecoratedBottle): void;
  /** Click "View product" → open ProductDetail in App. */
  onPickProduct?(productId: string): void;
  onEdit?(b: DecoratedBottle): void;
  onDuplicate?(b: DecoratedBottle): void;
}) {
  const products = useStore((s) => s.products);
  const recipesRaw = useStore((s) => s.recipes);
  const makeable = useStore((s) => s.makeable);
  const cat = catOf(bottle.category);

  const [detail, setDetail] = useState<BottleDetail | null>(null);
  const [productTags, setProductTags] = useState<ProductTagRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setDetail(null);
    setProductTags([]);
    setError(null);
    // Bottle detail (sparkline, stats, calibration)
    api
      .bottleDetail(bottle.id)
      .then((d) => {
        if (alive) setDetail(d);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "failed to load detail");
      });
    // Product tags (namespaced) — separate call so a failed product fetch
    // doesn't take down the sparkline.
    api
      .getProduct(bottle.raw.product_id)
      .then((p) => {
        if (alive) setProductTags(p.tags ?? []);
      })
      .catch(() => {
        /* no-op — chips just don't render */
      });
    return () => {
      alive = false;
    };
  }, [bottle.id, bottle.raw.product_id]);

  const tagsByNs = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const t of productTags) {
      const list = m.get(t.namespace) ?? [];
      list.push(t.value);
      m.set(t.namespace, list);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [productTags]);

  const recipes = useMemo(
    () => joinRecipes(recipesRaw, makeable, products),
    [recipesRaw, makeable, products],
  );
  const unlocks: JoinedRecipe[] = recipes
    .filter((r) => r.ingredients.some((i) => i.product === bottle.raw.product_id))
    .slice(0, 5);

  // Prefer live readings; fall back to the decorated synth spark while loading.
  const sparkValues = detail?.readings.length
    ? // Server returns most-recent-first; reverse so chart reads left→right.
      [...detail.readings]
        .reverse()
        .map((r) => (bottle.full_ml > 0 ? Math.max(0, Math.min(1, r.level_ml / bottle.full_ml)) : 0))
    : bottle.spark;

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
          width: 780,
          maxHeight: "85vh",
          background: T.surface,
          border: `1px solid ${T.hairline2}`,
          padding: "28px 32px",
          overflow: "auto",
          boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 6,
            marginBottom: 14,
          }}
        >
          {onEdit ? (
            <HeaderAction label="EDIT" title="edit bottle" onClick={() => onEdit(bottle)} />
          ) : null}
          {onDuplicate ? (
            <HeaderAction
              label="DUPLICATE"
              title="duplicate this bottle (same product, fresh stock)"
              onClick={() => onDuplicate(bottle)}
            />
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

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div>
            <div
              style={{
                fontSize: 10,
                fontFamily: T.mono,
                color: T.inkMuted,
                letterSpacing: "0.18em",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ width: 6, height: 6, background: `hsl(${cat.hue} 60% 55%)` }} />
              {cat.label.toUpperCase()} ·{" "}
              {detail?.calibration
                ? `${detail.calibration.device_id}/CH${String(detail.calibration.channel).padStart(2, "0")}`
                : bottle.tracked
                  ? `SLOT ${bottle.slot}`
                  : "MANUAL"}
            </div>
            <div style={{ fontSize: 32, fontWeight: 600, color: T.ink, letterSpacing: "-0.01em", marginTop: 4 }}>
              {bottle.name}
            </div>
          </div>
          <div
            style={{
              fontFamily: T.mono,
              fontSize: 42,
              color: accent,
              fontWeight: 500,
              letterSpacing: "-0.02em",
            }}
          >
            {Math.round(bottle.pct * 100)}%
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginTop: 18 }}>
          <Stat label="REMAINING" value={`${bottle.level_ml}ml`} delta={`of ${bottle.full_ml}ml`} />
          <Stat
            label="POURS · 28D"
            value={detail ? detail.stats.pours_28d.toString() : "…"}
            delta={detail?.stats.avg_ml_per_pour != null ? `~ ${detail.stats.avg_ml_per_pour}ml/pour` : "—"}
          />
          <Stat
            label="OPENED"
            value={detail?.stats.opened_days_ago != null ? `${detail.stats.opened_days_ago}d` : "—"}
            delta={detail?.stats.opened_days_ago != null ? "ago" : "no record"}
          />
          <Stat
            label="EST. EMPTY"
            value={detail?.stats.est_empty_days != null ? `~${detail.stats.est_empty_days}d` : "—"}
            delta={detail?.stats.est_empty_days != null ? "at current pace" : "no rate yet"}
            accent={accent}
          />
        </div>

        {(tagsByNs.length > 0 || onPickProduct) ? (
          <div
            style={{
              marginTop: 14,
              padding: "10px 12px",
              background: T.surface2,
              border: `1px solid ${T.hairline}`,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
              }}
            >
              <div style={{ fontSize: 10, letterSpacing: "0.18em", color: T.inkMuted }}>PRODUCT</div>
              {onPickProduct ? (
                <Pill color={accent} onClick={() => onPickProduct(bottle.raw.product_id)} title="open product detail">
                  → VIEW PRODUCT
                </Pill>
              ) : null}
            </div>
            {tagsByNs.length === 0 ? (
              <div style={{ fontSize: 11, color: T.inkDim }}>
                No namespaced tags on this product yet.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {tagsByNs.map(([ns, values]) => (
                  <div key={ns} style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <span
                      style={{
                        fontSize: 9,
                        fontFamily: T.mono,
                        color: T.cyan,
                        letterSpacing: "0.16em",
                        minWidth: 110,
                      }}
                    >
                      {ns.toUpperCase()}
                    </span>
                    {values.map((v) => (
                      <span
                        key={v}
                        style={{
                          padding: "2px 7px",
                          background: T.bg,
                          border: `1px solid ${T.hairline2}`,
                          fontSize: 11,
                          fontFamily: T.mono,
                          color: T.ink,
                        }}
                      >
                        {v}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        <Cell
          title={`LEVEL · LAST ${sparkValues.length} READINGS`}
          right={detail?.readings.length ? "live readings" : "sparkline (cached)"}
          style={{ marginTop: 14 }}
        >
          <div
            style={{
              flex: 1,
              padding: "14px 4px 8px",
              display: "flex",
              alignItems: "flex-end",
              gap: 4,
              height: 140,
              position: "relative",
            }}
          >
            {[0.25, 0.5, 0.75].map((t) => (
              <div
                key={t}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: `${(1 - t) * 100 - 6}%`,
                  height: 1,
                  background: T.hairline,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    right: 0,
                    top: -7,
                    fontSize: 9,
                    fontFamily: T.mono,
                    color: T.inkDim,
                    background: T.surface,
                    paddingLeft: 4,
                  }}
                >
                  {Math.round(bottle.full_ml * t)}ml
                </span>
              </div>
            ))}
            {sparkValues.map((v, i) => {
              const h = Math.min(100, v * 100);
              const isLast = i === sparkValues.length - 1;
              const reading = detail?.readings[detail.readings.length - 1 - i];
              const rows = reading
                ? [
                    { label: "ts", value: new Date(reading.ts).toLocaleString() },
                    { label: "level", value: `${Math.round(reading.level_ml)}ml` },
                    { label: "source", value: reading.source },
                  ]
                : [
                    { label: "step", value: `${i + 1} / ${sparkValues.length}` },
                    { label: "level", value: `${Math.round(bottle.full_ml * v)}ml (~${Math.round(v * 100)}%)` },
                    { label: "data", value: "synth fallback" },
                  ];
              return (
                <Tooltip key={i} content={<TooltipRows rows={rows} />}>
                  <div
                    style={{
                      flex: 1,
                      height: `${h}%`,
                      background: isLast ? accent : T.cyanDim,
                      opacity: isLast ? 0.95 : 0.7,
                      position: "relative",
                      cursor: "default",
                    }}
                  >
                    {isLast ? (
                      <div
                        style={{
                          position: "absolute",
                          bottom: "100%",
                          left: 0,
                          right: 0,
                          height: 2,
                          background: accent,
                        }}
                      />
                    ) : null}
                  </div>
                </Tooltip>
              );
            })}
          </div>
        </Cell>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
          <Cell
            title="CALIBRATION"
            right={
              detail?.calibration
                ? detail.calibration.slope != null
                  ? "OK · 2-pt"
                  : "uncalibrated"
                : "manual"
            }
          >
            <div
              style={{
                fontFamily: T.mono,
                fontSize: 11,
                color: T.inkMuted,
                lineHeight: 1.8,
                paddingTop: 6,
              }}
            >
              {detail?.calibration ? (
                <>
                  <div>
                    tare ·{" "}
                    <span style={{ color: T.ink }}>
                      {detail.calibration.tare_g != null ? `${detail.calibration.tare_g.toFixed(1)}g` : "—"}
                    </span>
                  </div>
                  <div>
                    slope ·{" "}
                    <span style={{ color: T.ink }}>
                      {detail.calibration.slope != null ? `${detail.calibration.slope.toFixed(3)} g/raw` : "—"}
                    </span>
                  </div>
                  <div>
                    offset ·{" "}
                    <span style={{ color: T.ink }}>
                      {detail.calibration.offset != null ? detail.calibration.offset.toFixed(1) : "—"}
                    </span>
                  </div>
                  <div>
                    channel ·{" "}
                    <span style={{ color: T.ink }}>
                      {detail.calibration.device_id}/CH{String(detail.calibration.channel).padStart(2, "0")}
                    </span>
                  </div>
                  <div>
                    density ·{" "}
                    <span style={{ color: T.ink }}>
                      {detail.calibration.density_g_ml != null
                        ? `${detail.calibration.density_g_ml.toFixed(2)} g/ml`
                        : "—"}
                    </span>
                  </div>
                  <div>
                    tare_g ·{" "}
                    <span style={{ color: bottle.raw.tare_g != null ? T.ink : T.amber }}>
                      {bottle.raw.tare_g != null ? `${bottle.raw.tare_g.toFixed(1)}g` : "not set"}
                    </span>
                  </div>
                  {onTare ? (
                    <div style={{ marginTop: 8 }}>
                      <Pill
                        color={accent}
                        active
                        onClick={() => {
                          onTare(bottle);
                          onClose();
                        }}
                      >
                        {bottle.raw.tare_g != null ? "RE-TARE" : "TARE BOTTLE"}
                      </Pill>
                    </div>
                  ) : null}
                </>
              ) : (
                <div style={{ fontSize: 12 }}>
                  This bottle isn't wired to a sensor channel. Add a mapping under Shelf to enable weight tracking.
                </div>
              )}
            </div>
          </Cell>
          <Cell title="UNLOCKS" right="recipes using this bottle">
            <div style={{ fontFamily: T.body, fontSize: 13, color: T.ink, paddingTop: 6, lineHeight: 1.7 }}>
              {unlocks.length === 0 ? (
                <div style={{ fontSize: 12, color: T.inkMuted }}>No recipes reference this bottle yet.</div>
              ) : (
                unlocks.map((r) => (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Dot status={r.status} />
                    <span>{r.name}</span>
                  </div>
                ))
              )}
            </div>
          </Cell>
        </div>

        {error ? (
          <div
            style={{
              marginTop: 12,
              padding: "8px 10px",
              fontSize: 11,
              color: T.amber,
              background: T.amberGlow,
              border: `1px solid ${T.amberDim}`,
              fontFamily: T.mono,
            }}
          >
            ⚠ {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}

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
