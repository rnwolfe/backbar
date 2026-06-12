import { useEffect, useMemo, useState } from "react";
import { T } from "../console/tokens";
import { latestChangelogEntry } from "./changelog";

const SEEN_KEY = "backbar.whatsNew.seenVersion";

export function WhatsNewModal() {
  const entry = useMemo(
    () => latestChangelogEntry(__BACKBAR_CHANGELOG__, __BACKBAR_VERSION__),
    [],
  );
  const [open, setOpen] = useState(() => {
    if (!entry || typeof localStorage === "undefined") return false;
    return localStorage.getItem(SEEN_KEY) !== __BACKBAR_VERSION__;
  });

  useEffect(() => {
    if (!entry || typeof localStorage === "undefined") return;
    if (localStorage.getItem(SEEN_KEY) !== __BACKBAR_VERSION__) setOpen(true);
  }, [entry]);

  if (!open || !entry) return null;

  const close = () => {
    try {
      localStorage.setItem(SEEN_KEY, __BACKBAR_VERSION__);
    } catch {
      // Dismissal persistence is best-effort; the modal still closes.
    }
    setOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="whats-new-title"
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(5,7,10,0.72)",
        display: "grid",
        placeItems: "center",
        padding: "18px",
      }}
    >
      <section
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(560px, 100%)",
          maxHeight: "min(720px, calc(100vh - 36px))",
          overflow: "auto",
          background: T.surface,
          border: `1px solid ${T.hairline2}`,
          boxShadow: "0 24px 80px rgba(0,0,0,0.52)",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            padding: "16px 18px 12px",
            borderBottom: `1px solid ${T.hairline}`,
          }}
        >
          <div>
            <div
              style={{
                color: T.inkMuted,
                fontFamily: T.mono,
                fontSize: 10,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}
            >
              Backbar v{entry.version}
            </div>
            <h2
              id="whats-new-title"
              style={{
                margin: "5px 0 0",
                color: T.ink,
                fontFamily: T.body,
                fontSize: 22,
                lineHeight: 1.1,
                letterSpacing: 0,
              }}
            >
              What's new
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close what's new"
            style={{
              flex: "0 0 auto",
              width: 34,
              height: 34,
              border: `1px solid ${T.hairline2}`,
              background: T.surface2,
              color: T.inkMuted,
              cursor: "pointer",
              fontFamily: T.mono,
              fontSize: 16,
            }}
          >
            x
          </button>
        </header>

        <div style={{ padding: "14px 18px 18px", display: "grid", gap: 14 }}>
          {entry.sections.map((section) => (
            <section key={section.title}>
              <h3
                style={{
                  margin: "0 0 8px",
                  color: T.inkMuted,
                  fontFamily: T.mono,
                  fontSize: 11,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                }}
              >
                {section.title}
              </h3>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  display: "grid",
                  gap: 7,
                  color: T.ink,
                  fontSize: 13,
                  lineHeight: 1.45,
                }}
              >
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
