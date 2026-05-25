/**
 * Product detail overlay — opened from a Catalog row click. Mirrors the
 * Bottle Detail pattern: stats strip + structured metadata + tag chips
 * grouped by namespace + linked bottles + recipes that reference this
 * product (directly via `ref_type:"product"`, or transitively via
 * `ref_type:"category"` / `ref_type:"tag"`).
 *
 * Fetches /products/:id (returns product + tags). Bottles + recipes come
 * from the store snapshot — they're cheap to re-derive.
 */
import { useEffect, useMemo, useState } from "react";
import type { Product, Recipe } from "@backbar/core";
import { api, type ProductTagRow } from "../../api/client";
import { Cell, Pill, Stat } from "../Cells";
import { Dot } from "../Chrome";
import { catOf, decorateBottle, joinRecipes, type DecoratedBottle, type JoinedRecipe } from "../../data/derive";
import { T } from "../tokens";
import { store, useStore } from "../../store/useStore";

interface Props {
  productId: string;
  onClose(): void;
  accent: string;
  onPickBottle?(b: DecoratedBottle): void;
  onPickRecipe?(r: JoinedRecipe): void;
  onEdit?(p: Product & { tags?: ProductTagRow[] }): void;
  onDuplicate?(p: Product & { tags?: ProductTagRow[] }): void;
}

export function ProductDetailOverlay({
  productId,
  onClose,
  accent,
  onPickBottle,
  onPickRecipe,
  onEdit,
  onDuplicate,
}: Props) {
  const products = useStore((s) => s.products);
  const bottlesRaw = useStore((s) => s.bottles);
  const recipesRaw = useStore((s) => s.recipes);
  const makeable = useStore((s) => s.makeable);

  const [detail, setDetail] = useState<(Product & { tags: (ProductTagRow & { product_id: string })[] }) | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setDetail(null);
    setError(null);
    api
      .getProduct(productId)
      .then((d) => {
        if (alive) setDetail(d);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "failed to load product");
      });
    return () => {
      alive = false;
    };
  }, [productId]);

  const cat = catOf(detail?.category ?? "_");

  // Bottles of this product
  const bottlesForProduct = useMemo<DecoratedBottle[]>(
    () =>
      bottlesRaw
        .filter((b) => b.product_id === productId)
        .map(decorateBottle)
        .sort((a, b) => b.pct - a.pct),
    [bottlesRaw, productId],
  );

  // Recipes that reference this product — direct (ref_type:'product' + ref_id===id),
  // by category (ref_type:'category' + ref_id===product.category), or
  // by tag (ref_type:'tag' + any tag the product has).
  const joinedRecipes = useMemo(() => joinRecipes(recipesRaw, makeable, products), [recipesRaw, makeable, products]);
  const tagKeys = useMemo(
    () => new Set((detail?.tags ?? []).map((t) => `${t.namespace}:${t.value}`)),
    [detail],
  );
  const flavorTagSet = useMemo(() => new Set(detail?.flavor_tags ?? []), [detail]);

  const relatedRecipes = useMemo<{ recipe: JoinedRecipe; reason: string }[]>(() => {
    if (!detail) return [];
    const out: { recipe: JoinedRecipe; reason: string }[] = [];
    for (const r of joinedRecipes) {
      for (const ing of r.raw.ingredients) {
        if (ing.ref_type === "product" && ing.ref_id === detail.id) {
          out.push({ recipe: r, reason: "direct" });
          break;
        }
        if (ing.ref_type === "category" && ing.ref_id === detail.category) {
          out.push({ recipe: r, reason: `via ${detail.category}` });
          break;
        }
        if (ing.ref_type === "tag" && ing.ref_id) {
          if (tagKeys.has(ing.ref_id) || (!ing.ref_id.includes(":") && flavorTagSet.has(ing.ref_id))) {
            out.push({ recipe: r, reason: `via tag ${ing.ref_id}` });
            break;
          }
        }
      }
    }
    return out;
  }, [detail, joinedRecipes, tagKeys, flavorTagSet]);

  // Group tags by namespace for the chip strip
  const tagsByNs = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const t of detail?.tags ?? []) {
      const list = m.get(t.namespace) ?? [];
      list.push(t.value);
      m.set(t.namespace, list);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [detail]);

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
          width: 820,
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
            position: "absolute",
            top: 14,
            right: 14,
            display: "flex",
            gap: 6,
            zIndex: 2,
          }}
        >
          {onEdit && detail ? (
            <HeaderAction label="EDIT" title="edit product" onClick={() => onEdit(detail)} />
          ) : null}
          {onDuplicate && detail ? (
            <HeaderAction label="DUPLICATE" title="duplicate this product" onClick={() => onDuplicate(detail)} />
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
              {cat.label.toUpperCase()}
              {detail?.subcategory ? ` · ${detail.subcategory.toUpperCase()}` : ""}
            </div>
            <div style={{ fontSize: 32, fontWeight: 600, color: T.ink, letterSpacing: "-0.01em", marginTop: 4 }}>
              {detail?.name ?? productId}
            </div>
            {detail?.distillery ? (
              <div style={{ fontSize: 13, color: T.inkMuted, marginTop: 4 }}>{detail.distillery}</div>
            ) : null}
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
            {detail?.abv != null ? `${Math.round(detail.abv * 100)}%` : "—"}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginTop: 18 }}>
          <Stat
            label="ORIGIN"
            value={detail?.origin_country ?? "—"}
            delta={detail?.origin_region ?? (detail?.origin_country ? "" : "no data")}
          />
          <Stat
            label="AGE"
            value={detail?.age_statement_y != null ? `${detail.age_statement_y}y` : "NAS"}
            delta={detail?.age_statement_y != null ? "stated" : "no statement"}
          />
          <Stat
            label="BOTTLES"
            value={bottlesForProduct.length.toString()}
            delta={
              bottlesForProduct.length === 0
                ? "none on hand"
                : bottlesForProduct.some((b) => b.low)
                  ? "some low"
                  : "healthy"
            }
          />
          <Stat
            label="RECIPES"
            value={relatedRecipes.length.toString()}
            delta="using this product"
            accent={accent}
          />
        </div>

        {detail?.notes ? (
          <div
            style={{
              marginTop: 14,
              padding: "10px 12px",
              background: T.surface2,
              border: `1px solid ${T.hairline}`,
              fontSize: 12,
              color: T.inkMuted,
              lineHeight: 1.6,
              fontStyle: "italic",
            }}
          >
            {detail.notes}
          </div>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
          <Cell title="TAGS" right={`${(detail?.tags ?? []).length} · ${tagsByNs.length} ns`}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 6 }}>
              {tagsByNs.length === 0 && (detail?.flavor_tags ?? []).length === 0 ? (
                <div style={{ fontSize: 12, color: T.inkMuted }}>
                  No tags yet. Add via the Edit button.
                </div>
              ) : null}

              {tagsByNs.map(([ns, values]) => (
                <div key={ns} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontSize: 9, fontFamily: T.mono, color: T.cyan, letterSpacing: "0.16em" }}>
                    {ns.toUpperCase()}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {values.map((v) => (
                      <span
                        key={v}
                        style={{
                          padding: "2px 8px",
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
                </div>
              ))}

              {(detail?.flavor_tags ?? []).length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontSize: 9, fontFamily: T.mono, color: T.inkDim, letterSpacing: "0.16em" }}>
                    FLAVOR (FREEFORM)
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {(detail?.flavor_tags ?? []).map((v) => (
                      <span
                        key={v}
                        style={{
                          padding: "2px 8px",
                          background: T.surface2,
                          border: `1px solid ${T.hairline}`,
                          fontSize: 11,
                          fontFamily: T.mono,
                          color: T.inkMuted,
                        }}
                      >
                        {v}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </Cell>

          <Cell title="ON HAND" right={`${bottlesForProduct.length} bottle${bottlesForProduct.length === 1 ? "" : "s"}`}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 6 }}>
              {bottlesForProduct.length === 0 ? (
                <div style={{ fontSize: 12, color: T.inkMuted }}>No bottles of this product.</div>
              ) : (
                bottlesForProduct.map((b) => (
                  <div
                    key={b.id}
                    onClick={() => onPickBottle?.(b)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "4px 0",
                      borderBottom: `1px solid ${T.hairline}`,
                      cursor: onPickBottle ? "pointer" : "default",
                      fontSize: 12,
                    }}
                  >
                    <span style={{ color: T.ink, flex: 1 }}>{b.tracked ? b.slot ?? "—" : "manual"}</span>
                    <span style={{ fontFamily: T.mono, fontSize: 11, color: T.ink }}>
                      {b.level_ml}
                      <span style={{ color: T.inkDim }}>/{b.full_ml}ml</span>
                    </span>
                    <span
                      style={{
                        fontFamily: T.mono,
                        fontSize: 11,
                        color: b.crit ? T.red : b.low ? T.amber : accent,
                        width: 36,
                        textAlign: "right",
                      }}
                    >
                      {Math.round(b.pct * 100)}%
                    </span>
                  </div>
                ))
              )}
            </div>
          </Cell>
        </div>

        <Cell title="UNLOCKS" right={`${relatedRecipes.length} recipe${relatedRecipes.length === 1 ? "" : "s"}`} style={{ marginTop: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 6 }}>
            {relatedRecipes.length === 0 ? (
              <div style={{ fontSize: 12, color: T.inkMuted }}>
                No recipes reference this product directly, by category, or by its tags.
              </div>
            ) : (
              relatedRecipes.map(({ recipe, reason }) => (
                <div
                  key={recipe.id + reason}
                  onClick={() => onPickRecipe?.(recipe)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "4px 0",
                    borderBottom: `1px solid ${T.hairline}`,
                    cursor: onPickRecipe ? "pointer" : "default",
                    fontSize: 12,
                  }}
                >
                  <Dot status={recipe.status} />
                  <span style={{ color: T.ink, flex: 1 }}>{recipe.name}</span>
                  <span style={{ fontFamily: T.mono, fontSize: 10, color: T.inkDim }}>{reason}</span>
                </div>
              ))
            )}
          </div>
        </Cell>

        {detail?.producer_url ? (
          <div style={{ marginTop: 12 }}>
            <Pill
              color={accent}
              onClick={() => {
                if (detail.producer_url) window.open(detail.producer_url, "_blank");
              }}
            >
              ↗ PRODUCER PAGE
            </Pill>
          </div>
        ) : null}

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

        {/* Keep store reference live so the overlay re-renders when bottles/recipes update via WS */}
        <span style={{ display: "none" }}>{store.get().bottles.length}</span>
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
