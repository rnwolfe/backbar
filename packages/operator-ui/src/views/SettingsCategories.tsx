/**
 * Categories panel for Settings. List / add / rename / recolor / delete the
 * palette registry. Deletes are server-side guarded (409 when products still
 * use the id) — we surface the error inline.
 */
import { useMemo, useState } from "react";
import type { Category } from "@backbar/core";
import { api } from "../api/client";
import { Cell, Pill } from "../console/Cells";
import { T } from "../console/tokens";
import { store, useStore } from "../store/useStore";

export function SettingsCategories() {
  const categories = useStore((s) => s.categories);
  const products = useStore((s) => s.products);

  const productCountById = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) m.set(p.category, (m.get(p.category) ?? 0) + 1);
    return m;
  }, [products]);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function patch(id: string, patch: Partial<Pick<Category, "label" | "hue" | "sort_order">>) {
    setBusy(id);
    setError(null);
    try {
      await api.patchCategory(id, patch);
      await store.refreshCategories();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    const inUse = productCountById.get(id) ?? 0;
    if (inUse > 0) {
      setError(
        `'${id}' is used by ${inUse} product${inUse === 1 ? "" : "s"} — reassign them first.`,
      );
      return;
    }
    if (!window.confirm(`Delete category '${id}'?`)) return;
    setBusy(id);
    setError(null);
    try {
      await api.deleteCategory(id);
      await store.refreshCategories();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function create(id: string, label: string, hue: number) {
    setBusy("__new__");
    setError(null);
    try {
      const nextSort = categories.reduce((m, c) => Math.max(m, c.sort_order), 0) + 10;
      await api.createCategory({ id, label, hue, sort_order: nextSort });
      await store.refreshCategories();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setBusy(null);
    }
  }

  return (
    <Cell title="CATEGORIES" right={`${categories.length} in palette`}>
      <div style={{ paddingTop: 4 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "16px 110px 1fr 60px 60px 28px",
            gap: 10,
            padding: "0 4px 6px",
            fontSize: 9,
            letterSpacing: "0.14em",
            color: T.inkDim,
            fontFamily: T.mono,
          }}
        >
          <span />
          <span>ID</span>
          <span>LABEL</span>
          <span>HUE</span>
          <span style={{ textAlign: "right" }}>USED</span>
          <span />
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {categories.map((c) => (
            <CategoryRow
              key={c.id}
              cat={c}
              count={productCountById.get(c.id) ?? 0}
              busy={busy === c.id}
              onPatch={(p) => patch(c.id, p)}
              onDelete={() => remove(c.id)}
            />
          ))}
        </div>

        <NewCategoryRow
          busy={busy === "__new__"}
          existingIds={categories.map((c) => c.id)}
          onCreate={create}
        />

        {error ? (
          <div
            style={{
              marginTop: 10,
              padding: "8px 10px",
              background: T.redGlow,
              border: `1px solid ${T.red}`,
              color: T.red,
              fontFamily: T.mono,
              fontSize: 11,
              whiteSpace: "pre-wrap",
            }}
          >
            ⚠ {error}
          </div>
        ) : null}
      </div>
    </Cell>
  );
}

function CategoryRow({
  cat,
  count,
  busy,
  onPatch,
  onDelete,
}: {
  cat: Category;
  count: number;
  busy: boolean;
  onPatch(patch: Partial<Pick<Category, "label" | "hue" | "sort_order">>): void;
  onDelete(): void;
}) {
  const [label, setLabel] = useState(cat.label);
  const [hue, setHue] = useState(cat.hue);

  const isDirty = label !== cat.label || hue !== cat.hue;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "16px 110px 1fr 60px 60px 28px",
        gap: 10,
        alignItems: "center",
        padding: "5px 4px",
        borderTop: `1px solid ${T.hairline}`,
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          background: `hsl(${hue} 60% 55%)`,
          border: `1px solid ${T.hairline2}`,
        }}
      />
      <span style={{ fontFamily: T.mono, fontSize: 11, color: T.inkMuted }}>{cat.id}</span>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => {
          if (label !== cat.label) onPatch({ label });
        }}
        disabled={busy}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "4px 6px",
          background: T.surface2,
          border: `1px solid ${T.hairline2}`,
          color: T.ink,
          fontFamily: T.body,
          fontSize: 12,
          outline: "none",
          borderRadius: 0,
        }}
      />
      <input
        type="number"
        min={0}
        max={360}
        value={hue}
        onChange={(e) => setHue(Number(e.target.value))}
        onBlur={() => {
          if (hue !== cat.hue) onPatch({ hue });
        }}
        disabled={busy}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "4px 6px",
          background: T.surface2,
          border: `1px solid ${T.hairline2}`,
          color: T.ink,
          fontFamily: T.mono,
          fontSize: 12,
          outline: "none",
          borderRadius: 0,
          textAlign: "right",
        }}
      />
      <span
        style={{
          textAlign: "right",
          fontFamily: T.mono,
          fontSize: 12,
          color: count > 0 ? T.ink : T.inkDim,
        }}
      >
        {count}
      </span>
      <button
        type="button"
        onClick={onDelete}
        disabled={busy || count > 0}
        title={count > 0 ? `in use by ${count} products` : "delete"}
        style={{
          width: 26,
          height: 24,
          background: "transparent",
          border: `1px solid ${T.hairline2}`,
          color: count > 0 ? T.inkDim : T.red,
          fontFamily: T.mono,
          fontSize: 13,
          cursor: count > 0 || busy ? "not-allowed" : "pointer",
        }}
      >
        ✕
      </button>
    </div>
  );
}

function NewCategoryRow({
  busy,
  existingIds,
  onCreate,
}: {
  busy: boolean;
  existingIds: string[];
  onCreate(id: string, label: string, hue: number): Promise<void>;
}) {
  const [id, setId] = useState("");
  const [label, setLabel] = useState("");
  const [hue, setHue] = useState(200);

  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);

  const idClean = slug(id || label);
  const duplicate = idClean.length > 0 && existingIds.includes(idClean);
  const canSubmit = idClean.length > 0 && label.trim().length > 0 && !duplicate && !busy;

  async function submit() {
    if (!canSubmit) return;
    try {
      await onCreate(idClean, label.trim(), hue);
      setId("");
      setLabel("");
      setHue(200);
    } catch {
      // error surfaced by parent
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "16px 110px 1fr 60px 60px 28px",
        gap: 10,
        alignItems: "center",
        padding: "8px 4px",
        marginTop: 10,
        background: T.surface2,
        border: `1px dashed ${T.hairline2}`,
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          background: `hsl(${hue} 60% 55%)`,
          border: `1px solid ${T.hairline2}`,
        }}
      />
      <input
        value={id}
        onChange={(e) => setId(e.target.value)}
        placeholder={label ? slug(label) : "id (kebab)"}
        disabled={busy}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "4px 6px",
          background: T.surface,
          border: `1px solid ${duplicate ? T.red : T.hairline2}`,
          color: T.ink,
          fontFamily: T.mono,
          fontSize: 12,
          outline: "none",
          borderRadius: 0,
        }}
      />
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Display label"
        disabled={busy}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
        }}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "4px 6px",
          background: T.surface,
          border: `1px solid ${T.hairline2}`,
          color: T.ink,
          fontFamily: T.body,
          fontSize: 12,
          outline: "none",
          borderRadius: 0,
        }}
      />
      <input
        type="number"
        min={0}
        max={360}
        value={hue}
        onChange={(e) => setHue(Number(e.target.value))}
        disabled={busy}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "4px 6px",
          background: T.surface,
          border: `1px solid ${T.hairline2}`,
          color: T.ink,
          fontFamily: T.mono,
          fontSize: 12,
          outline: "none",
          borderRadius: 0,
          textAlign: "right",
        }}
      />
      <span />
      <Pill color={T.cyan} active={canSubmit} disabled={!canSubmit} onClick={() => void submit()}>
        +
      </Pill>
    </div>
  );
}
