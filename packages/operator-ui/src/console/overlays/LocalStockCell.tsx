/**
 * LocalStockCell — VA ABC "nearest store in stock + price" for a product.
 * Shared by ProductDetail (catalog) and BottleDetail. Lazy-fetches
 * /products/:id/local on mount and stays SILENT when the feature is off,
 * unconfigured, or there's no local data (spec §10: "absence is silent").
 *
 * Only renders a cell once there's something to show.
 */
import { useEffect, useState } from "react";
import { api, type LocalStockResponse } from "../../api/client";
import { Cell } from "../Cells";
import { T } from "../tokens";

export function LocalStockCell({
  productId,
  accent,
  style,
}: {
  productId: string;
  accent: string;
  style?: React.CSSProperties;
}) {
  const [data, setData] = useState<LocalStockResponse | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    api
      .localStock(productId)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {
        if (alive) setData({ available: false, reason: "no-data" });
      });
    return () => {
      alive = false;
    };
  }, [productId]);

  // Silent until we have a positive, available result.
  if (!data || !data.available) return null;

  const topStores = data.stores.slice(0, 4);
  const price = data.price_cents != null ? `$${(data.price_cents / 100).toFixed(2)}` : null;

  return (
    <Cell
      title="LOCAL · VA ABC"
      right={data.in_stock ? `${data.stores.length} store${data.stores.length === 1 ? "" : "s"}` : "out of stock"}
      style={style}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              fontFamily: T.mono,
              fontSize: 11,
              letterSpacing: "0.12em",
              color: data.in_stock ? accent : T.amber,
            }}
          >
            {data.in_stock ? "● IN STOCK" : "○ OUT OF STOCK"}
          </span>
          {price ? (
            <span style={{ fontFamily: T.mono, fontSize: 13, color: T.ink, marginLeft: "auto" }}>{price}</span>
          ) : null}
        </div>

        {topStores.length === 0 ? (
          <div style={{ fontSize: 12, color: T.inkMuted }}>Not stocked at any nearby store.</div>
        ) : (
          topStores.map((s) => (
            <div
              key={s.store_number}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "4px 0",
                borderBottom: `1px solid ${T.hairline}`,
                fontSize: 12,
              }}
            >
              <span style={{ color: T.ink, flex: 1 }}>
                {s.name}
                {s.city ? <span style={{ color: T.inkDim }}> · {s.city}</span> : null}
              </span>
              {s.distance_mi != null ? (
                <span style={{ fontFamily: T.mono, fontSize: 11, color: T.inkMuted, width: 56, textAlign: "right" }}>
                  {s.distance_mi.toFixed(1)} mi
                </span>
              ) : null}
              <span style={{ fontFamily: T.mono, fontSize: 11, color: accent, width: 40, textAlign: "right" }}>
                ×{s.qty}
              </span>
            </div>
          ))
        )}

        <div style={{ fontSize: 9, fontFamily: T.mono, color: T.inkDim, letterSpacing: "0.1em" }}>
          {data.scope.toUpperCase()}
          {data.matched_name ? ` · ${data.matched_name}` : ""}
        </div>
      </div>
    </Cell>
  );
}
