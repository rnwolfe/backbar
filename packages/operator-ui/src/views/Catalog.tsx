/**
 * Catalog — product SKU library. Restyled into the Console palette.
 * Search, category filter, and a clean tabular list.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Cell, Pill, SectionHead } from "../console/Cells";
import { PageHead } from "../console/Chrome";
import { T, accent } from "../console/tokens";
import { catOf } from "../data/derive";
import { store, useStore } from "../store/useStore";

interface Props {
  onAddProduct?(): void;
  onEditProduct?(id: string): void;
  onDuplicateProduct?(id: string): void;
  onPickProduct?(id: string): void;
}

export function Catalog({ onAddProduct, onEditProduct, onDuplicateProduct, onPickProduct }: Props = {}) {
  const navigate = useNavigate();
  const tweaks = useStore((s) => s.tweaks);
  const products = useStore((s) => s.products);
  const bottles = useStore((s) => s.bottles);
  const categoryRegistry = useStore((s) => s.categories);
  const A = accent(tweaks.accent).primary;

  const bottleCountByProduct = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of bottles) m.set(b.product_id, (m.get(b.product_id) ?? 0) + 1);
    return m;
  }, [bottles]);

  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState<string>("all");

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) set.add(p.category);
    const ordered: string[] = [];
    for (const c of categoryRegistry) if (set.has(c.id)) ordered.push(c.id);
    for (const id of set) if (!ordered.includes(id)) ordered.push(id);
    return ordered;
  }, [products, categoryRegistry]);

  const filtered = useMemo(
    () =>
      products.filter((p) => {
        if (activeCat !== "all" && p.category !== activeCat) return false;
        if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      }),
    [products, activeCat, search],
  );

  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0, position: "relative", zIndex: 1 }}>
      <aside
        style={{
          width: 220,
          borderRight: `1px solid ${T.hairline}`,
          background: T.surface,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <SectionHead right={`${products.length}`}>CATEGORY</SectionHead>
        <div style={{ padding: "8px 0", overflowY: "auto", flex: 1 }}>
          <CategoryRow
            id="all"
            label="All products"
            count={products.length}
            active={activeCat === "all"}
            onClick={() => setActiveCat("all")}
          />
          {categories.map((id) => {
            const cat = catOf(id);
            const count = products.filter((p) => p.category === id).length;
            return (
              <CategoryRow
                key={id}
                id={id}
                label={cat.label}
                count={count}
                hue={cat.hue}
                active={activeCat === id}
                onClick={() => setActiveCat(id)}
              />
            );
          })}
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
          title="Catalog"
          meta={`${filtered.length} of ${products.length} products`}
          actions={
            <>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="search ⌘K"
                aria-label="filter products"
                style={{
                  background: T.surface2,
                  border: `1px solid ${T.hairline2}`,
                  color: T.ink,
                  fontFamily: T.mono,
                  fontSize: 11,
                  padding: "4px 10px",
                  width: 200,
                  outline: "none",
                  letterSpacing: "0.04em",
                }}
              />
              <Pill color={A} onClick={onAddProduct} title="add a new product (SKU) to the catalog">
                + ADD PRODUCT
              </Pill>
            </>
          }
        />

        <div style={{ flex: 1, minHeight: 0, padding: "0 16px" }}>
          {products.length === 0 ? (
            <Cell padded>
              <div style={{ padding: "24px 8px", color: T.inkMuted, fontSize: 13 }}>
                No products yet — reseed the bar via the SET tab.
              </div>
            </Cell>
          ) : (
            <div style={{ border: `1px solid ${T.hairline}`, background: T.surface }}>
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
                <div style={{ width: 120 }}>CATEGORY</div>
                <div style={{ flex: 1 }}>PRODUCT</div>
                <div style={{ width: 120 }}>SUBCATEGORY</div>
                <div style={{ width: 60, textAlign: "right" }}>ABV</div>
                <div style={{ width: 80, textAlign: "right" }}>BOTTLES</div>
                <div style={{ width: 140, textAlign: "right" }}>ID</div>
                <div style={{ width: 84, textAlign: "right" }}>ACTIONS</div>
              </div>
              {filtered.map((p) => {
                const cat = catOf(p.category);
                const n = bottleCountByProduct.get(p.id) ?? 0;
                return (
                  <div
                    key={p.id}
                    onClick={() => onPickProduct?.(p.id)}
                    title="click to open product detail"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      height: 32,
                      padding: "0 14px",
                      borderBottom: `1px solid ${T.hairline}`,
                      gap: 14,
                      fontSize: 12,
                      cursor: n > 0 ? "pointer" : "default",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => {
                      if (n > 0) (e.currentTarget as HTMLDivElement).style.background = T.surface2;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLDivElement).style.background = "transparent";
                    }}
                  >
                    <div
                      style={{
                        width: 120,
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
                        flex: 1,
                        color: T.ink,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {p.name}
                    </div>
                    <div style={{ width: 120, fontFamily: T.mono, fontSize: 10, color: T.inkDim }}>
                      {p.subcategory ?? "—"}
                    </div>
                    <div
                      style={{
                        width: 60,
                        textAlign: "right",
                        fontFamily: T.mono,
                        fontSize: 11,
                        color: T.ink,
                      }}
                    >
                      {p.abv != null ? `${Math.round(p.abv * 100)}%` : "—"}
                    </div>
                    <div
                      style={{ width: 80, display: "flex", justifyContent: "flex-end" }}
                      onClick={(e) => {
                        if (n > 0) {
                          e.stopPropagation();
                          store.filterBottlesByProduct(p.id);
                          navigate("/bottles");
                        }
                      }}
                      title={n > 0 ? `show ${n} bottle${n === 1 ? "" : "s"} of ${p.name}` : "no bottles of this product"}
                    >
                      <span
                        style={{
                          fontFamily: T.mono,
                          fontSize: 11,
                          color: n > 0 ? A : T.inkDim,
                          textDecoration: n > 0 ? "underline" : "none",
                          textDecorationStyle: "dotted",
                          textUnderlineOffset: 2,
                          cursor: n > 0 ? "pointer" : "default",
                        }}
                      >
                        {n > 0 ? `→ ${n}` : "—"}
                      </span>
                    </div>
                    <div
                      style={{
                        width: 140,
                        textAlign: "right",
                        fontFamily: T.mono,
                        fontSize: 10,
                        color: T.inkDim,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {p.id}
                    </div>
                    <div
                      style={{
                        width: 84,
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: 4,
                      }}
                    >
                      <RowAction
                        label="EDIT"
                        title="edit product details + tags"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditProduct?.(p.id);
                        }}
                      />
                      <RowAction
                        label="DUP"
                        title="duplicate this product with a new slug"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDuplicateProduct?.(p.id);
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RowAction({
  label,
  title,
  onClick,
}: {
  label: string;
  title: string;
  onClick(e: React.MouseEvent<HTMLButtonElement>): void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        padding: "2px 8px",
        background: "transparent",
        border: `1px solid ${T.hairline2}`,
        color: T.inkMuted,
        fontFamily: T.mono,
        fontSize: 9,
        letterSpacing: "0.12em",
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

function CategoryRow({
  label,
  count,
  active,
  hue,
  onClick,
}: {
  id: string;
  label: string;
  count: number;
  active: boolean;
  hue?: number;
  onClick(): void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "6px 16px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        cursor: "pointer",
        background: active ? T.surface2 : "transparent",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: active ? T.ink : T.inkMuted }}>
        <span style={{ width: 6, height: 6, background: hue != null ? `hsl(${hue} 60% 55%)` : T.inkDim }} />
        {label}
      </span>
      <span style={{ fontFamily: T.mono, fontSize: 10, color: T.inkDim }}>{count}</span>
    </div>
  );
}
