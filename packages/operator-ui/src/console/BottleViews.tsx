/**
 * Three bottle visualizations, all on the Console palette:
 *   GRID    — dense tile w/ tick-bar level + slot code (default Console look)
 *   RIBBON  — horizontal track w/ category swatch + sparkline-tinted bar
 *   LIST    — tabular row, smallest height per bottle, sortable feel
 */
import { Fragment } from "react";
import { T } from "./tokens";
import { Tooltip, TooltipRows } from "./Tooltip";
import type { ConsoleCategory, DecoratedBottle } from "../data/derive";
import { catOf, groupByCat } from "../data/derive";

function bottleTooltipRows(b: DecoratedBottle): { label: string; value: string }[] {
  const cat = catOf(b.category);
  return [
    { label: "bottle", value: b.name },
    { label: "category", value: cat.label },
    { label: "level", value: `${b.level_ml}/${b.full_ml}ml (${Math.round(b.pct * 100)}%)` },
    { label: "slot", value: b.tracked && b.slot ? b.slot : "manual" },
    ...(b.crit ? [{ label: "alert", value: "CRITICAL — order soon" }] : b.low ? [{ label: "alert", value: "LOW" }] : []),
  ];
}

// ── GRID TILE ────────────────────────────────────────────────────────────
export function BottleTile({
  b,
  accent,
  onClick,
}: {
  b: DecoratedBottle;
  accent: string;
  onClick?: () => void;
}) {
  const pct = Math.round(b.pct * 100);
  const barColor = b.crit ? T.red : b.low ? T.amber : accent;
  return (
    <Tooltip content={<TooltipRows rows={bottleTooltipRows(b)} />}>
    <div
      onClick={onClick}
      style={{
        padding: "9px 11px",
        background: T.surface,
        border: `1px solid ${T.hairline}`,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        position: "relative",
        minHeight: 78,
        cursor: onClick ? "pointer" : "default",
        transition: "background 0.12s, border-color 0.12s",
      }}
      onMouseEnter={(e) => {
        if (!onClick) return;
        e.currentTarget.style.background = T.surface2;
        e.currentTarget.style.borderColor = T.hairline2;
      }}
      onMouseLeave={(e) => {
        if (!onClick) return;
        e.currentTarget.style.background = T.surface;
        e.currentTarget.style.borderColor = T.hairline;
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, justifyContent: "space-between" }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: T.ink,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            flex: 1,
          }}
        >
          {b.name}
        </div>
        {b.tracked && b.slot ? (
          <div style={{ fontFamily: T.mono, fontSize: 9, color: T.inkDim, letterSpacing: "0.04em" }}>{b.slot}</div>
        ) : null}
      </div>
      <div style={{ position: "relative", height: 14 }}>
        <div style={{ position: "absolute", inset: 0, background: T.surface2, border: `1px solid ${T.hairline2}` }} />
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            width: `${pct}%`,
            background: barColor,
            opacity: 0.85,
          }}
        />
        {[0.25, 0.5, 0.75].map((t) => (
          <div
            key={t}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${t * 100}%`,
              width: 1,
              background: T.bg,
              opacity: 0.7,
            }}
          />
        ))}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          fontFamily: T.mono,
          fontSize: 11,
        }}
      >
        <span style={{ color: T.ink }}>
          {b.level_ml}
          <span style={{ color: T.inkDim }}>/{b.full_ml}ml</span>
        </span>
        <span style={{ color: b.low ? barColor : T.inkMuted, fontWeight: 500 }}>{pct}%</span>
      </div>
      {!b.tracked ? (
        <div
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 5,
            height: 5,
            background: T.inkVdim,
            transform: "rotate(45deg)",
          }}
          title="manual"
        />
      ) : null}
    </div>
    </Tooltip>
  );
}

/** Category divider for the grid view. */
export function CatDivider({
  cat,
  count,
  avg,
  accent,
}: {
  cat: ConsoleCategory;
  count: number;
  avg: number;
  accent: string;
}) {
  return (
    <div
      style={{
        gridColumn: "1/-1",
        display: "flex",
        alignItems: "baseline",
        gap: 10,
        padding: "14px 4px 6px",
        borderBottom: `1px solid ${T.hairline}`,
        marginBottom: 4,
      }}
    >
      <div style={{ fontSize: 10, letterSpacing: "0.18em", color: accent, fontWeight: 600 }}>
        {cat.label.toUpperCase()}
      </div>
      <div
        style={{
          flex: 1,
          height: 1,
          background: `linear-gradient(to right, ${T.hairline} 0%, transparent 100%)`,
        }}
      />
      <div style={{ fontFamily: T.mono, fontSize: 10, color: T.inkDim }}>
        n={count} avg={avg}%
      </div>
    </div>
  );
}

// ── RIBBON TRACK ─────────────────────────────────────────────────────────
export function RibbonTrack({
  b,
  accent,
  onClick,
}: {
  b: DecoratedBottle;
  accent: string;
  onClick?: () => void;
}) {
  const cat = catOf(b.category);
  const catColor = `hsl(${cat.hue} 70% 58%)`;
  const catBg = `hsl(${cat.hue} 60% 22%)`;
  return (
    <Tooltip content={<TooltipRows rows={bottleTooltipRows(b)} />}>
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "stretch",
        height: 26,
        borderBottom: `1px solid ${T.hairline}`,
        background: b.low ? "rgba(236,90,77,0.04)" : "transparent",
        cursor: onClick ? "pointer" : "default",
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => {
        if (!onClick) return;
        e.currentTarget.style.background = b.low ? "rgba(236,90,77,0.08)" : T.surface2;
      }}
      onMouseLeave={(e) => {
        if (!onClick) return;
        e.currentTarget.style.background = b.low ? "rgba(236,90,77,0.04)" : "transparent";
      }}
    >
      <div
        style={{
          width: 50,
          padding: "0 8px",
          display: "flex",
          alignItems: "center",
          fontFamily: T.mono,
          fontSize: 10,
          color: b.tracked ? T.inkMuted : T.inkVdim,
          borderRight: `1px solid ${T.hairline}`,
          background: T.bg,
        }}
      >
        {b.tracked ? b.slot : "·MAN·"}
      </div>
      <div
        style={{
          width: 24,
          background: catBg,
          position: "relative",
          borderRight: `1px solid ${T.hairline}`,
        }}
      >
        <div style={{ position: "absolute", inset: 0, background: catColor, opacity: 0.4 }} />
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: 6,
            height: 6,
            background: catColor,
            transform: "translate(-50%,-50%)",
            borderRadius: "50%",
            boxShadow: `0 0 6px ${catColor}`,
          }}
        />
      </div>
      <div
        style={{
          width: 200,
          padding: "0 12px",
          display: "flex",
          alignItems: "center",
          fontSize: 12,
          color: T.ink,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          borderRight: `1px solid ${T.hairline}`,
        }}
      >
        {b.name}
      </div>
      <div
        style={{
          flex: 1,
          position: "relative",
          background: `linear-gradient(90deg, ${T.surface} 0%, ${T.bg} 100%)`,
          borderRight: `1px solid ${T.hairline}`,
        }}
      >
        {[0.25, 0.5, 0.75].map((t) => (
          <div
            key={t}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${t * 100}%`,
              width: 1,
              background: T.inkVdim,
            }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            top: 3,
            bottom: 3,
            left: 0,
            width: `${b.pct * 100}%`,
            background: catColor,
            opacity: b.low ? 0.7 : 0.92,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "flex-end",
              gap: 1,
              paddingTop: 1,
              paddingBottom: 1,
            }}
          >
            {b.spark.slice(-12).map((v, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: `${Math.min(100, v * 100)}%`,
                  background: "rgba(0,0,0,0.20)",
                  minWidth: 2,
                }}
              />
            ))}
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${b.pct * 100}%`,
            width: 1,
            background: b.crit ? T.red : T.ink,
            marginLeft: -0.5,
            opacity: 0.95,
            boxShadow: b.crit ? `0 0 4px ${T.red}` : "none",
          }}
        />
      </div>
      <div
        style={{
          width: 84,
          padding: "0 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          fontFamily: T.mono,
          fontSize: 11,
          color: T.ink,
          borderRight: `1px solid ${T.hairline}`,
        }}
      >
        {b.level_ml}
        <span style={{ color: T.inkDim }}>/{b.full_ml}</span>
      </div>
      <div
        style={{
          width: 54,
          padding: "0 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          fontFamily: T.mono,
          fontSize: 12,
          color: b.crit ? T.red : b.low ? T.amber : accent,
          fontWeight: 500,
        }}
      >
        {Math.round(b.pct * 100)}
        <span style={{ color: T.inkDim, fontSize: 9, marginLeft: 1 }}>%</span>
      </div>
    </div>
    </Tooltip>
  );
}

export function RibbonHeader() {
  return (
    <div
      style={{
        display: "flex",
        height: 26,
        borderBottom: `1px solid ${T.hairline}`,
        background: T.surface,
        fontSize: 9,
        color: T.inkMuted,
        letterSpacing: "0.14em",
      }}
    >
      <div
        style={{
          width: 50,
          padding: "0 8px",
          display: "flex",
          alignItems: "center",
          borderRight: `1px solid ${T.hairline}`,
        }}
      >
        SLOT
      </div>
      <div style={{ width: 24, borderRight: `1px solid ${T.hairline}` }} />
      <div
        style={{
          width: 200,
          padding: "0 12px",
          display: "flex",
          alignItems: "center",
          borderRight: `1px solid ${T.hairline}`,
        }}
      >
        BOTTLE
      </div>
      <div
        style={{
          flex: 1,
          padding: "0 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderRight: `1px solid ${T.hairline}`,
        }}
      >
        <span>LEVEL · 0</span>
        <span>25</span>
        <span>50</span>
        <span>75</span>
        <span>100%</span>
      </div>
      <div
        style={{
          width: 84,
          padding: "0 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          borderRight: `1px solid ${T.hairline}`,
        }}
      >
        ML
      </div>
      <div
        style={{
          width: 54,
          padding: "0 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
        }}
      >
        %
      </div>
    </div>
  );
}

export function RibbonCategoryHead({
  cat,
  bottles,
}: {
  cat: ConsoleCategory;
  bottles: DecoratedBottle[];
}) {
  const avg = Math.round((bottles.reduce((s, b) => s + b.pct, 0) / bottles.length) * 100);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 14px",
        background: T.bg,
        borderBottom: `1px solid ${T.hairline}`,
        fontSize: 10,
        letterSpacing: "0.18em",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          background: `hsl(${cat.hue} 70% 58%)`,
          boxShadow: `0 0 6px hsl(${cat.hue} 70% 58%)`,
        }}
      />
      <span style={{ color: `hsl(${cat.hue} 60% 70%)`, fontWeight: 600 }}>{cat.label.toUpperCase()}</span>
      <span style={{ color: T.inkDim }}>·</span>
      <span style={{ color: T.inkMuted, fontFamily: T.mono, letterSpacing: "0.04em" }}>n={bottles.length}</span>
      <span style={{ color: T.inkDim }}>·</span>
      <span style={{ color: T.inkMuted, fontFamily: T.mono, letterSpacing: "0.04em" }}>avg={avg}%</span>
      <div
        style={{
          flex: 1,
          height: 1,
          background: `linear-gradient(90deg, hsl(${cat.hue} 40% 20%) 0%, transparent 100%)`,
          marginLeft: 6,
        }}
      />
    </div>
  );
}

// ── LIST ROW ─────────────────────────────────────────────────────────────
export function ListRow({
  b,
  accent,
  onClick,
}: {
  b: DecoratedBottle;
  accent: string;
  onClick?: () => void;
}) {
  const cat = catOf(b.category);
  return (
    <Tooltip content={<TooltipRows rows={bottleTooltipRows(b)} />}>
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        height: 30,
        padding: "0 14px",
        borderBottom: `1px solid ${T.hairline}`,
        gap: 14,
        fontSize: 12,
        cursor: onClick ? "pointer" : "default",
        background: b.low ? "rgba(236,90,77,0.03)" : "transparent",
      }}
      onMouseEnter={(e) => {
        if (onClick) e.currentTarget.style.background = T.surface2;
      }}
      onMouseLeave={(e) => {
        if (onClick) e.currentTarget.style.background = b.low ? "rgba(236,90,77,0.03)" : "transparent";
      }}
    >
      <div
        style={{
          width: 90,
          fontFamily: T.mono,
          fontSize: 10,
          color: T.inkMuted,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span style={{ width: 6, height: 6, background: `hsl(${cat.hue} 60% 55%)` }} />
        {cat.label}
      </div>
      <div
        style={{
          width: 50,
          fontFamily: T.mono,
          fontSize: 10,
          color: b.tracked ? T.inkMuted : T.inkVdim,
        }}
      >
        {b.tracked ? b.slot : "manual"}
      </div>
      <div
        style={{
          flex: 1,
          color: T.ink,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {b.name}
      </div>
      <div
        style={{
          width: 200,
          position: "relative",
          height: 6,
          background: T.surface2,
          border: `1px solid ${T.hairline2}`,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            width: `${b.pct * 100}%`,
            background: b.crit ? T.red : b.low ? T.amber : accent,
            opacity: 0.85,
          }}
        />
      </div>
      <div
        style={{
          width: 100,
          textAlign: "right",
          fontFamily: T.mono,
          fontSize: 11,
          color: T.ink,
        }}
      >
        {b.level_ml}
        <span style={{ color: T.inkDim }}>/{b.full_ml}ml</span>
      </div>
      <div
        style={{
          width: 42,
          textAlign: "right",
          fontFamily: T.mono,
          fontSize: 12,
          color: b.crit ? T.red : b.low ? T.amber : T.inkMuted,
        }}
      >
        {Math.round(b.pct * 100)}%
      </div>
    </div>
    </Tooltip>
  );
}

export function ListHeader() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: 30,
        padding: "0 14px",
        borderBottom: `1px solid ${T.hairline}`,
        background: T.surface2,
        gap: 14,
        fontSize: 9,
        color: T.inkMuted,
        letterSpacing: "0.14em",
      }}
    >
      <div style={{ width: 90 }}>CATEGORY</div>
      <div style={{ width: 50 }}>SLOT</div>
      <div style={{ flex: 1 }}>BOTTLE ↓</div>
      <div style={{ width: 200, textAlign: "center" }}>LEVEL</div>
      <div style={{ width: 100, textAlign: "right" }}>VOLUME</div>
      <div style={{ width: 42, textAlign: "right" }}>%</div>
    </div>
  );
}

// ── Layout wrappers ──────────────────────────────────────────────────────

export function BottleGridView({
  bottles,
  accent,
  onPick,
  columns,
}: {
  bottles: DecoratedBottle[];
  accent: string;
  onPick?(b: DecoratedBottle): void;
  /** Override the grid column count — defaults to 5 (desktop). Use 2 on
   *  mobile so each tile keeps a tappable footprint. */
  columns?: number;
}) {
  const groups = groupByCat(bottles);
  const cols = columns ?? 5;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: 8,
        paddingBottom: 24,
      }}
    >
      {groups.map((g) => {
        const avg = Math.round((g.bottles.reduce((s, b) => s + b.pct, 0) / g.bottles.length) * 100);
        return (
          <Fragment key={g.cat.id}>
            <CatDivider cat={g.cat} count={g.bottles.length} avg={avg} accent={accent} />
            {g.bottles.map((b) => (
              <BottleTile key={b.id} b={b} accent={accent} onClick={onPick ? () => onPick(b) : undefined} />
            ))}
          </Fragment>
        );
      })}
    </div>
  );
}

export function BottleRibbonView({
  bottles,
  accent,
  onPick,
}: {
  bottles: DecoratedBottle[];
  accent: string;
  onPick?(b: DecoratedBottle): void;
}) {
  const groups = groupByCat(bottles);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        paddingBottom: 24,
        border: `1px solid ${T.hairline}`,
        background: T.surface,
      }}
    >
      <RibbonHeader />
      {groups.map((g) => (
        <Fragment key={g.cat.id}>
          <RibbonCategoryHead cat={g.cat} bottles={g.bottles} />
          {[...g.bottles]
            .sort((a, b) => b.pct - a.pct)
            .map((b) => (
              <RibbonTrack
                key={b.id}
                b={b}
                accent={accent}
                onClick={onPick ? () => onPick(b) : undefined}
              />
            ))}
        </Fragment>
      ))}
    </div>
  );
}

export function BottleListView({
  bottles,
  accent,
  onPick,
}: {
  bottles: DecoratedBottle[];
  accent: string;
  onPick?(b: DecoratedBottle): void;
}) {
  const sorted = [...bottles].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div style={{ border: `1px solid ${T.hairline}`, background: T.surface, marginBottom: 24 }}>
      <ListHeader />
      {sorted.map((b) => (
        <ListRow key={b.id} b={b} accent={accent} onClick={onPick ? () => onPick(b) : undefined} />
      ))}
    </div>
  );
}
