/**
 * Guest Menu — publish + preview split screen.
 * Left rail: select makeable subset, choose host mode, publish.
 * Right pane: live preview of the guest-facing menu.
 */
import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { Cell } from "../console/Cells";
import { QrCodeOverlay } from "../console/overlays/QrCodeOverlay";
import { T, accent } from "../console/tokens";
import { joinRecipes, type JoinedRecipe } from "../data/derive";
import { store, useStore } from "../store/useStore";
import { useViewport } from "../util/useViewport";

export function Menu() {
  const tweaks = useStore((s) => s.tweaks);
  const products = useStore((s) => s.products);
  const recipesRaw = useStore((s) => s.recipes);
  const makeable = useStore((s) => s.makeable);
  const A = accent(tweaks.accent).primary;

  const joined = useMemo(
    () => joinRecipes(recipesRaw, makeable, products),
    [recipesRaw, makeable, products],
  );
  const makeableList = joined.filter((r) => r.status === "makeable");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [publishing, setPublishing] = useState(false);
  const [lastResult, setLastResult] = useState<{ url: string; count: number } | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const { isMobile } = useViewport();
  const guestUrl = lastResult?.url ?? publicUrl ?? "";
  const guestHost = guestUrl ? guestUrl.replace(/^https?:\/\//, "") : "set GUEST_PUBLIC_URL";

  // The real public guest-menu URL comes from the server (GUEST_PUBLIC_URL),
  // not a hardcoded brand placeholder.
  useEffect(() => {
    api
      .menuInfo()
      .then((info) => setPublicUrl(info.public_url))
      .catch(() => {});
  }, []);

  // Seed selection: any recipe already flagged is_published, else the first 7 makeable.
  useEffect(() => {
    if (selected.size > 0) return;
    const preselected = makeableList.filter((r) => r.raw.is_published).map((r) => r.id);
    if (preselected.length > 0) {
      setSelected(new Set(preselected));
    } else if (makeableList.length > 0) {
      setSelected(new Set(makeableList.slice(0, 7).map((r) => r.id)));
    }
  }, [makeableList, selected.size]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const published = makeableList.filter((r) => selected.has(r.id));

  const publish = async () => {
    setPublishing(true);
    setPublishError(null);
    try {
      const res = await api.publishMenu([...selected]);
      setLastResult({ url: res.url ?? guestUrl, count: res.count });
      // Reflect the now-persisted is_published flags in the store.
      await store.refreshRecipes();
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : "publish failed");
    } finally {
      setPublishing(false);
    }
  };

  const dateLabel = new Date()
    .toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })
    .toUpperCase();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        flex: 1,
        minHeight: 0,
        overflow: isMobile ? "auto" : "hidden",
      }}
    >
      <div
        style={{
          width: isMobile ? "auto" : 440,
          padding: "18px 18px",
          borderRight: isMobile ? "none" : `1px solid ${T.hairline}`,
          borderBottom: isMobile ? `1px solid ${T.hairline}` : "none",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          overflow: isMobile ? "visible" : "auto",
          flexShrink: 0,
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>Guest Menu</div>
          <div style={{ fontSize: 11, color: T.inkMuted, fontFamily: T.mono, marginTop: 2 }}>
            publish the makeable subset · guest sees only what you can actually pour
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Cell title="LAST PUBLISH" right={lastResult ? "just now" : "3d ago"} padded={false}>
            <div style={{ padding: "10px 14px" }}>
              <div style={{ fontFamily: T.mono, fontSize: 13, color: T.ink }}>
                {lastResult ? `${lastResult.count} recipes` : `${published.length} ready`}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: 10, color: T.inkDim, marginTop: 4 }}>
                {guestHost}
              </div>
            </div>
          </Cell>
          <Cell title="GUEST OPENS" right="last 7d" padded={false}>
            <div style={{ padding: "10px 14px" }}>
              <div style={{ fontFamily: T.mono, fontSize: 13, color: A }}>34</div>
              <div style={{ fontFamily: T.mono, fontSize: 10, color: T.inkDim, marginTop: 4 }}>via QR · ~5/day</div>
            </div>
          </Cell>
        </div>

        <div
          style={{
            fontSize: 11,
            color: T.inkMuted,
            lineHeight: 1.5,
            padding: "10px 12px",
            border: `1px solid ${T.hairline2}`,
            background: T.surface2,
          }}
        >
          Publishing updates the live guest menu instantly. Guests see exactly the
          recipes you select below — and only while they stay makeable, so a
          draining bottle drops its drink automatically.
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.14em", color: T.inkMuted }}>
              DRAFT · {selected.size} RECIPES
            </div>
            <button
              type="button"
              onClick={() => setSelected(new Set(makeableList.map((r) => r.id)))}
              style={{
                background: "transparent",
                border: "none",
                color: T.inkMuted,
                fontFamily: T.mono,
                fontSize: 10,
                cursor: "pointer",
              }}
            >
              select all
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {makeableList.length === 0 ? (
              <div style={{ fontSize: 12, color: T.inkMuted, padding: "8px 0" }}>
                No makeable recipes — fix one-aways or reseed the bar.
              </div>
            ) : (
              makeableList.map((r) => {
                const on = selected.has(r.id);
                return (
                  <div
                    key={r.id}
                    onClick={() => toggle(r.id)}
                    style={{
                      padding: "8px 10px",
                      background: on ? T.surface2 : "transparent",
                      border: `1px solid ${on ? T.hairline2 : "transparent"}`,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      cursor: "pointer",
                    }}
                  >
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        border: `1px solid ${on ? A : T.inkDim}`,
                        background: on ? A : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {on ? (
                        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                          <path d="M1.5 5L4 7.5L8.5 2" stroke={T.bg} strokeWidth="1.5" fill="none" />
                        </svg>
                      ) : null}
                    </span>
                    <span style={{ fontSize: 13, color: on ? T.ink : T.inkMuted, flex: 1 }}>{r.name}</span>
                    <span style={{ fontFamily: T.mono, fontSize: 9, color: T.inkDim, letterSpacing: "0.08em" }}>
                      {r.family}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {publishError ? (
          <div
            style={{
              padding: "8px 10px",
              fontSize: 11,
              color: T.red,
              background: T.redGlow,
              border: `1px solid ${T.red}`,
              fontFamily: T.mono,
            }}
          >
            ⚠ {publishError}
          </div>
        ) : null}

        {lastResult ? (
          <div
            style={{
              padding: "8px 10px",
              fontSize: 11,
              color: T.green,
              background: T.greenGlow,
              border: `1px solid ${T.green}`,
              fontFamily: T.mono,
            }}
          >
            ✓ {lastResult.count} recipes → {lastResult.url}
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
          <button
            type="button"
            onClick={() => setQrOpen(true)}
            title={`generate scannable QR for ${guestUrl}`}
            style={{
              flex: 1,
              padding: "10px 0",
              background: T.surface2,
              border: `1px solid ${T.hairline2}`,
              color: T.ink,
              fontFamily: T.mono,
              fontSize: 11,
              letterSpacing: "0.12em",
              cursor: "pointer",
            }}
          >
            QR CODE
          </button>
          <button
            type="button"
            onClick={() => void publish()}
            disabled={publishing}
            style={{
              flex: 2,
              padding: "10px 0",
              background: publishing ? T.surface2 : A,
              border: "none",
              color: publishing ? T.inkMuted : T.bg,
              fontFamily: T.mono,
              fontSize: 12,
              letterSpacing: "0.14em",
              fontWeight: 600,
              cursor: publishing ? "wait" : "pointer",
            }}
          >
            {publishing ? "PUBLISHING…" : "✦ PUBLISH TO GUEST"}
          </button>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          padding: "18px 24px",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative",
          background: `radial-gradient(ellipse at 50% 20%, ${T.surface} 0%, ${T.bg} 80%)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 14,
            right: 18,
            fontSize: 9,
            letterSpacing: "0.18em",
            color: T.inkDim,
            fontFamily: T.mono,
            padding: "4px 9px",
            border: `1px solid ${T.hairline2}`,
          }}
        >
          PREVIEW · GUEST VIEW
        </div>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.32em", color: T.inkMuted, fontFamily: T.mono }}>
            THE BACKBAR · HOUSE LIST
          </div>
          <div
            style={{
              fontSize: 34,
              fontWeight: 300,
              color: T.ink,
              letterSpacing: "-0.01em",
              marginTop: 6,
              lineHeight: 1,
            }}
          >
            Evening Service
          </div>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 8 }}>
            <div style={{ width: 50, height: 1, background: A, opacity: 0.4 }} />
            <div style={{ fontSize: 10, letterSpacing: "0.32em", color: T.inkMuted, fontFamily: T.mono }}>
              {dateLabel}
            </div>
            <div style={{ width: 50, height: 1, background: A, opacity: 0.4 }} />
          </div>
        </div>

        {published.length === 0 ? (
          <div style={{ fontSize: 13, color: T.inkMuted, textAlign: "center", padding: "32px 8px" }}>
            Select recipes on the left to compose tonight's list.
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "14px 36px",
              alignContent: "start",
              overflow: "auto",
              padding: "0 20px",
            }}
          >
            {published.map((r, i) => (
              <PreviewItem key={r.id} r={r} index={i} />
            ))}
          </div>
        )}
      </div>

      {qrOpen ? <QrCodeOverlay url={guestUrl} onClose={() => setQrOpen(false)} /> : null}
    </div>
  );
}

function PreviewItem({ r, index }: { r: JoinedRecipe; index: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontFamily: T.mono, fontSize: 10, color: T.inkDim, letterSpacing: "0.16em" }}>
          {String(index + 1).padStart(2, "0")}
        </span>
        <span style={{ fontSize: 18, fontWeight: 500, color: T.ink }}>{r.name}</span>
        <div style={{ flex: 1, height: 1, background: T.hairline2, alignSelf: "center" }} />
      </div>
      <div
        style={{
          fontSize: 11,
          color: T.inkMuted,
          lineHeight: 1.5,
          paddingLeft: 22,
          fontFamily: T.body,
        }}
      >
        {r.ingredients.map((i) => i.label).join(" · ")}
      </div>
      <div
        style={{
          display: "flex",
          gap: 10,
          paddingLeft: 22,
          marginTop: 2,
          fontFamily: T.mono,
          fontSize: 9,
          color: T.inkDim,
          letterSpacing: "0.06em",
        }}
      >
        <span>{r.family}</span>
        <span>·</span>
        <span>{r.method}</span>
        <span>·</span>
        <span>{r.glass}</span>
      </div>
    </div>
  );
}
