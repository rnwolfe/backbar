/**
 * Rapid inventory sweep — a full-screen, big-touch BAR-MODE flow for walking
 * the shelf and recording fill levels fast (spec api.md §2).
 *
 *   1. FILTER — operator picks/confirms which bottles to sweep (status,
 *      category, low-stock-only, tracked-only, name search) BEFORE the first
 *      bottle is shown. `GET /sweep/bottles` returns the ordered source list.
 *   2. SWEEP  — one bottle at a time with large tap targets: Empty / gone plus
 *      25 / 50 / 75 / 100 %. Every tap POSTs `/sweep/level`, which writes an
 *      append-only manual reading; on success the screen advances immediately.
 *   3. DONE   — completion summary when the filtered list is exhausted (or was
 *      empty), with the option to start another sweep or exit.
 *
 * Stateless on the server: this component owns the ordered ids + cursor. The
 * live `reading.updated` socket event keeps the rest of the console honest, so
 * we don't re-hydrate per save — that would defeat the "rapid" point.
 *
 * Deliberately minimal chrome, mirroring ServiceMode: none of the dense
 * console grid, just the filter, the current bottle, and the controls. Sized
 * to work at 375px wide without horizontal overflow and on tablet consoles.
 */
import { useMemo, useRef, useState } from "react";
import type { SweepFilter, SweepLevelKey, SweepRow } from "../api/client";
import { api } from "../api/client";
import { useStore } from "../store/useStore";
import { T } from "../console/tokens";

type Phase = "filter" | "sweep" | "done";

const STATUS_OPTIONS: { key: SweepFilter["status"] | ""; label: string }[] = [
  { key: "", label: "All" },
  { key: "sealed", label: "Sealed" },
  { key: "open", label: "Open" },
  { key: "empty", label: "Empty" },
  { key: "archived", label: "Archived" },
];

/** The four quarter fills, rendered as a grid. Empty/gone is rendered apart. */
const QUARTERS: { key: SweepLevelKey; label: string }[] = [
  { key: "25", label: "25%" },
  { key: "50", label: "50%" },
  { key: "75", label: "75%" },
  { key: "100", label: "100%" },
];

export function Sweep({
  onClose,
  onToast,
  accent,
}: {
  onClose(): void;
  onToast(t: string): void;
  accent: string;
}) {
  const categories = useStore((s) => s.categories);
  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [categories],
  );

  const [phase, setPhase] = useState<Phase>("filter");
  const [filter, setFilter] = useState<SweepFilter>({});
  const [rows, setRows] = useState<SweepRow[]>([]);
  const [cursor, setCursor] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [emptiedCount, setEmptiedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);

  // Synchronous re-entrancy guard. `saving` (React state) only disables the
  // controls on the *next* render, so a fast double-tap fires two click events
  // in one tick that both observe `saving === false` and POST twice. The ref
  // flips synchronously, so the second tap — save OR skip — returns immediately.
  const busy = useRef(false);

  const current = rows[cursor] ?? null;

  /** Move past the current bottle; the exhausted list lands on the done state. */
  function advance() {
    const next = cursor + 1;
    if (next >= rows.length) setPhase("done");
    else setCursor(next);
  }

  async function startSweep() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.sweepBottles(filter);
      setRows(res.bottles);
      setCursor(0);
      setSavedCount(0);
      setEmptiedCount(0);
      setSkippedCount(0);
      setPhase(res.count === 0 ? "done" : "sweep");
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load bottles");
    } finally {
      setLoading(false);
    }
  }

  async function save(level: SweepLevelKey) {
    if (!current || busy.current) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      const res = await api.sweepLevel({ bottle_id: current.bottle.id, level });
      setSavedCount((n) => n + 1);
      if (level === "empty") {
        setEmptiedCount((n) => n + 1);
        // Surface the product-level replacement prompt the empty/gone save
        // produced — it's now on the shopping list for later review.
        const sig = res.shopping_signal;
        const name = sig?.product.name ?? current.display.name;
        onToast(sig?.out ? `${name} out — added to shopping list` : `${name} → shopping list`);
      }
      // On a 2xx, advance immediately. End of list → completion state.
      advance();
    } catch (e) {
      // Stay on the current bottle and surface the error — never advance on
      // failure. The operator retries by tapping the level again.
      setError(e instanceof Error ? e.message : "save failed — try again");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  /** Move to the next bottle without recording a reading. */
  function skip() {
    if (!current || busy.current) return;
    setError(null);
    setSkippedCount((n) => n + 1);
    advance();
  }

  function backToFilter() {
    setPhase("filter");
    setRows([]);
    setCursor(0);
    setError(null);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: T.bg,
        display: "flex",
        flexDirection: "column",
        paddingTop: "var(--safe-top, 0px)",
        paddingBottom: "var(--safe-bottom, 0px)",
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 16px",
          borderBottom: `1px solid ${T.hairline}`,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: T.mono,
              fontSize: 13,
              letterSpacing: "0.16em",
              color: T.inkMuted,
              fontWeight: 600,
            }}
          >
            INVENTORY SWEEP
          </div>
          {phase === "sweep" ? (
            <div style={{ fontSize: 12, color: T.inkDim, fontFamily: T.mono, marginTop: 2 }}>
              {cursor + 1} / {rows.length}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            height: 48,
            padding: "0 16px",
            background: "transparent",
            border: `1px solid ${T.hairline2}`,
            color: T.inkMuted,
            fontFamily: T.mono,
            fontSize: 13,
            letterSpacing: "0.16em",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          ✕ EXIT
        </button>
      </div>

      {/* Sweep-phase progress bar */}
      {phase === "sweep" && rows.length > 0 ? (
        <div style={{ height: 3, background: T.hairline, width: "100%" }}>
          <div
            style={{
              height: "100%",
              width: `${(cursor / rows.length) * 100}%`,
              background: accent,
              transition: "width 120ms ease",
            }}
          />
        </div>
      ) : null}

      {phase === "filter" ? (
        <FilterStep
          filter={filter}
          setFilter={setFilter}
          categories={sortedCategories}
          accent={accent}
          loading={loading}
          error={error}
          onStart={() => void startSweep()}
        />
      ) : phase === "sweep" && current ? (
        <SweepStep
          row={current}
          accent={accent}
          saving={saving}
          error={error}
          onSave={(lvl) => void save(lvl)}
          onSkip={skip}
        />
      ) : (
        <DoneStep
          accent={accent}
          total={savedCount}
          emptied={emptiedCount}
          skipped={skippedCount}
          empty={rows.length === 0}
          onNewSweep={backToFilter}
          onExit={onClose}
        />
      )}
    </div>
  );
}

// ─── filter step ────────────────────────────────────────────────────────────

function FilterStep({
  filter,
  setFilter,
  categories,
  accent,
  loading,
  error,
  onStart,
}: {
  filter: SweepFilter;
  setFilter: React.Dispatch<React.SetStateAction<SweepFilter>>;
  categories: { id: string; label: string; hue: number }[];
  accent: string;
  loading: boolean;
  error: string | null;
  onStart(): void;
}) {
  return (
    <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          flex: 1,
          padding: 16,
          maxWidth: 640,
          width: "100%",
          margin: "0 auto",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }}
      >
        <p style={{ margin: 0, color: T.inkMuted, fontSize: 14, lineHeight: 1.5 }}>
          Pick which bottles to walk through. Then tap a fill level for each one and
          the sweep advances automatically.
        </p>

        <Field label="Status">
          <ChipRow>
            {STATUS_OPTIONS.map((s) => {
              const active = (filter.status ?? "") === s.key;
              return (
                <Chip
                  key={s.key || "all"}
                  active={active}
                  accent={accent}
                  onClick={() =>
                    setFilter((f) => ({ ...f, status: s.key === "" ? undefined : s.key }))
                  }
                >
                  {s.label}
                </Chip>
              );
            })}
          </ChipRow>
        </Field>

        <Field label="Category">
          <ChipRow>
            <Chip
              active={!filter.category}
              accent={accent}
              onClick={() => setFilter((f) => ({ ...f, category: undefined }))}
            >
              All
            </Chip>
            {categories.map((c) => (
              <Chip
                key={c.id}
                active={filter.category === c.id}
                accent={accent}
                hue={c.hue}
                onClick={() =>
                  setFilter((f) => ({
                    ...f,
                    category: f.category === c.id ? undefined : c.id,
                  }))
                }
              >
                {c.label}
              </Chip>
            ))}
          </ChipRow>
        </Field>

        <Field label="Refine">
          <ChipRow>
            <Chip
              active={filter.low === true}
              accent={accent}
              onClick={() =>
                setFilter((f) => ({ ...f, low: f.low ? undefined : true }))
              }
            >
              Low stock only
            </Chip>
            <Chip
              active={filter.tracked === true}
              accent={accent}
              onClick={() =>
                setFilter((f) => ({ ...f, tracked: f.tracked ? undefined : true }))
              }
            >
              Tracked only
            </Chip>
          </ChipRow>
        </Field>

        <Field label="Search">
          <input
            value={filter.q ?? ""}
            onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value || undefined }))}
            placeholder="product name…"
            style={{
              width: "100%",
              boxSizing: "border-box",
              height: 48,
              padding: "0 14px",
              background: T.surface,
              border: `1px solid ${T.hairline2}`,
              color: T.ink,
              fontFamily: T.body,
              fontSize: 15,
              outline: "none",
            }}
          />
        </Field>

        {error ? <ErrorLine text={error} /> : null}
      </div>

      {/* Sticky-ish footer */}
      <div
        style={{
          padding: 16,
          maxWidth: 640,
          width: "100%",
          margin: "0 auto",
          boxSizing: "border-box",
          borderTop: `1px solid ${T.hairline}`,
        }}
      >
        <button
          type="button"
          onClick={onStart}
          disabled={loading}
          style={{
            width: "100%",
            height: 60,
            background: accent,
            border: `1px solid ${accent}`,
            color: T.bg,
            fontFamily: T.mono,
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: "0.14em",
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "LOADING…" : "START SWEEP"}
        </button>
      </div>
    </div>
  );
}

// ─── sweep step ─────────────────────────────────────────────────────────────

function SweepStep({
  row,
  accent,
  saving,
  error,
  onSave,
  onSkip,
}: {
  row: SweepRow;
  accent: string;
  saving: boolean;
  error: string | null;
  onSave(level: SweepLevelKey): void;
  onSkip(): void;
}) {
  const d = row.display;
  const hue = d.category_hue;
  const catColor = hue != null ? `hsl(${hue} 70% 60%)` : T.inkMuted;
  return (
    <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          flex: 1,
          padding: 16,
          maxWidth: 640,
          width: "100%",
          margin: "0 auto",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Current bottle */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", minHeight: 160 }}>
          {d.category_label ? (
            <div
              style={{
                display: "inline-flex",
                alignSelf: "flex-start",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                border: `1px solid ${T.hairline2}`,
                borderLeft: `3px solid ${catColor}`,
                color: T.inkMuted,
                fontFamily: T.mono,
                fontSize: 11,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              {d.category_label}
            </div>
          ) : null}
          <div
            style={{
              fontSize: 30,
              fontWeight: 700,
              color: T.ink,
              lineHeight: 1.15,
              wordBreak: "break-word",
            }}
          >
            {d.name}
          </div>
          <div
            style={{
              marginTop: 10,
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              alignItems: "center",
              fontFamily: T.mono,
              fontSize: 13,
              color: T.inkMuted,
            }}
          >
            <span>
              {Math.round(d.level_ml)}
              <span style={{ color: T.inkDim }}>/{d.full_ml} ml</span>
            </span>
            <span style={{ color: T.inkDim }}>·</span>
            <span>{d.fill_pct}%</span>
            <span style={{ color: T.inkDim }}>·</span>
            <span>{d.status}</span>
            {d.slot ? (
              <>
                <span style={{ color: T.inkDim }}>·</span>
                <span>{d.slot}</span>
              </>
            ) : null}
            {d.low ? <span style={{ color: T.amber }}>· low</span> : null}
          </div>
        </div>

        {error ? <ErrorLine text={error} /> : null}

        {/* Controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            {QUARTERS.map((q) => (
              <button
                key={q.key}
                type="button"
                disabled={saving}
                onClick={() => onSave(q.key)}
                style={{
                  height: 84,
                  background: T.surface2,
                  border: `1px solid ${T.hairline2}`,
                  borderBottom: `3px solid ${accent}`,
                  color: T.ink,
                  fontFamily: T.mono,
                  fontSize: 26,
                  fontWeight: 700,
                  cursor: saving ? "default" : "pointer",
                  opacity: saving ? 0.5 : 1,
                }}
              >
                {q.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => onSave("empty")}
            style={{
              height: 72,
              width: "100%",
              background: "transparent",
              border: `1px solid ${T.red}`,
              color: T.red,
              fontFamily: T.mono,
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: "0.08em",
              cursor: saving ? "default" : "pointer",
              opacity: saving ? 0.5 : 1,
            }}
          >
            EMPTY / GONE
          </button>
          {/* Skip — advance without recording a reading. Secondary weight so
              it never reads as a fill choice; blocked while a save is in flight. */}
          <button
            type="button"
            disabled={saving}
            onClick={onSkip}
            style={{
              height: 56,
              width: "100%",
              background: "transparent",
              border: `1px solid ${T.hairline2}`,
              color: T.inkMuted,
              fontFamily: T.mono,
              fontSize: 14,
              letterSpacing: "0.14em",
              cursor: saving ? "default" : "pointer",
              opacity: saving ? 0.5 : 1,
            }}
          >
            SKIP →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── done step ──────────────────────────────────────────────────────────────

function DoneStep({
  accent,
  total,
  emptied,
  skipped,
  empty,
  onNewSweep,
  onExit,
}: {
  accent: string;
  total: number;
  emptied: number;
  skipped: number;
  empty: boolean;
  onNewSweep(): void;
  onExit(): void;
}) {
  return (
    <div
      style={{
        flex: 1,
        overflow: "auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        textAlign: "center",
        gap: 18,
      }}
    >
      <div style={{ fontSize: 40 }}>{empty ? "○" : "✓"}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: T.ink }}>
        {empty ? "No bottles match this filter" : "Sweep complete"}
      </div>
      {empty ? (
        <p style={{ margin: 0, color: T.inkMuted, fontSize: 15, maxWidth: 340, lineHeight: 1.5 }}>
          Nothing to walk through. Adjust the filter and try again.
        </p>
      ) : (
        <p style={{ margin: 0, color: T.inkMuted, fontSize: 15, lineHeight: 1.6 }}>
          Recorded {total} {total === 1 ? "level" : "levels"}
          {emptied > 0 ? (
            <>
              {" · "}
              {emptied} marked empty
            </>
          ) : null}
          {skipped > 0 ? (
            <>
              {" · "}
              {skipped} skipped
            </>
          ) : null}
        </p>
      )}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", width: "100%", maxWidth: 420 }}>
        <button
          type="button"
          onClick={onNewSweep}
          style={{
            flex: 1,
            minWidth: 140,
            height: 56,
            background: T.surface2,
            border: `1px solid ${T.hairline2}`,
            color: T.ink,
            fontFamily: T.mono,
            fontSize: 14,
            letterSpacing: "0.1em",
            cursor: "pointer",
          }}
        >
          NEW SWEEP
        </button>
        <button
          type="button"
          onClick={onExit}
          style={{
            flex: 1,
            minWidth: 140,
            height: 56,
            background: accent,
            border: `1px solid ${accent}`,
            color: T.bg,
            fontFamily: T.mono,
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: "0.1em",
            cursor: "pointer",
          }}
        >
          DONE
        </button>
      </div>
    </div>
  );
}

// ─── shared bits ────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          fontFamily: T.mono,
          fontSize: 11,
          letterSpacing: "0.16em",
          color: T.inkDim,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{children}</div>;
}

function Chip({
  children,
  active,
  accent,
  hue,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  accent: string;
  hue?: number;
  onClick(): void;
}) {
  const dot = hue != null ? `hsl(${hue} 70% 60%)` : null;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        minHeight: 40,
        padding: "0 14px",
        background: active ? accent : T.surface,
        border: `1px solid ${active ? accent : T.hairline2}`,
        color: active ? T.bg : T.inkMuted,
        fontFamily: T.body,
        fontSize: 14,
        fontWeight: active ? 600 : 400,
        cursor: "pointer",
      }}
    >
      {dot ? (
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: dot,
            display: "inline-block",
            flexShrink: 0,
          }}
        />
      ) : null}
      {children}
    </button>
  );
}

function ErrorLine({ text }: { text: string }) {
  return (
    <div
      role="alert"
      style={{
        padding: "10px 12px",
        border: `1px solid ${T.red}`,
        background: T.redGlow,
        color: T.red,
        fontFamily: T.mono,
        fontSize: 13,
        lineHeight: 1.4,
        wordBreak: "break-word",
      }}
    >
      {text}
    </div>
  );
}
