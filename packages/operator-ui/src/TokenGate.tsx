import { useEffect, useState } from "react";
import { getToken, isChallenged, onTokenChange, setToken } from "./auth";
import { T } from "./console/tokens";

/**
 * Operator access gate. Only appears once the production server has actually
 * rejected a request (a 401 → `markUnauthorized`), so a token-less dev server
 * never shows it. The operator pastes the shared token once; we persist it and
 * reload so the whole app re-hydrates with the auth header attached.
 */
export function TokenGate() {
  const [, force] = useState(0);
  const [value, setValue] = useState("");

  useEffect(() => onTokenChange(() => force((n) => n + 1)), []);

  if (!isChallenged() || getToken()) return null;

  const submit = () => {
    const token = value.trim();
    if (!token) return;
    setToken(token);
    // Full reload is the simplest correct re-auth: every store hydrates fresh
    // and the WebSocket reconnects with the token in its query string.
    location.reload();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="token-gate-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(5,7,10,0.86)",
        display: "grid",
        placeItems: "center",
        padding: "18px",
      }}
    >
      <section
        style={{
          width: "min(420px, 100%)",
          background: T.surface,
          border: `1px solid ${T.hairline2}`,
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
          padding: "22px 22px 20px",
          display: "grid",
          gap: 14,
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
            Backbar Console
          </div>
          <h2
            id="token-gate-title"
            style={{
              margin: "6px 0 0",
              color: T.ink,
              fontFamily: T.body,
              fontSize: 20,
              lineHeight: 1.15,
            }}
          >
            Operator access token
          </h2>
          <p style={{ margin: "8px 0 0", color: T.inkMuted, fontSize: 13, lineHeight: 1.45 }}>
            This console is protected. Paste the operator token to continue.
          </p>
        </div>

        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="paste token…"
          aria-label="Operator access token"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "10px 12px",
            background: T.surface2,
            border: `1px solid ${T.hairline2}`,
            color: T.ink,
            fontFamily: T.mono,
            fontSize: 14,
            outline: "none",
          }}
        />

        <button
          type="button"
          onClick={submit}
          style={{
            padding: "10px 12px",
            background: T.cyan,
            border: `1px solid ${T.cyan}`,
            color: "#05080b",
            cursor: "pointer",
            fontFamily: T.mono,
            fontSize: 12,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          Unlock console
        </button>
      </section>
    </div>
  );
}
