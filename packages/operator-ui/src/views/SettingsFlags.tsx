/**
 * Feature flags panel. Server is the source of truth — toggling here PATCHes
 * /flags/:key, which emits a WS `flag.changed` event that updates the store
 * for every connected client without a page reload.
 */
import { useState } from "react";
import { api } from "../api/client";
import { Cell, Pill } from "../console/Cells";
import { T } from "../console/tokens";
import { store, useStore } from "../store/useStore";

export function SettingsFlags() {
  const flags = useStore((s) => s.flags);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(key: string, next: boolean) {
    setBusy(key);
    setError(null);
    try {
      await api.patchFlag(key, next);
      // The WS `flag.changed` event will land too; refreshFlags is a safety
      // net in case the socket is currently reconnecting.
      await store.refreshFlags();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Cell title="FEATURE FLAGS" right={`${flags.length} known`}>
      <div style={{ paddingTop: 4, display: "flex", flexDirection: "column" }}>
        {flags.length === 0 ? (
          <div style={{ padding: "12px 4px", fontSize: 11, color: T.inkDim, fontFamily: T.mono }}>
            loading flags…
          </div>
        ) : null}

        {flags.map((f) => (
          <div
            key={f.key}
            style={{
              padding: "10px 4px",
              borderTop: `1px solid ${T.hairline}`,
              display: "grid",
              gridTemplateColumns: "1fr 90px",
              gap: 12,
              alignItems: "start",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 13, color: T.ink, fontWeight: 500 }}>{f.label}</span>
                <span style={{ fontFamily: T.mono, fontSize: 10, color: T.inkDim }}>{f.key}</span>
                {f.enabled !== f.default_enabled ? (
                  <span
                    title="overridden — differs from the default in code"
                    style={{
                      fontFamily: T.mono,
                      fontSize: 9,
                      letterSpacing: "0.12em",
                      padding: "1px 5px",
                      background: T.surface2,
                      color: T.amber,
                      border: `1px solid ${T.hairline2}`,
                    }}
                  >
                    OVERRIDE
                  </span>
                ) : null}
              </div>
              {f.description ? (
                <div style={{ fontSize: 11, color: T.inkMuted, lineHeight: 1.5, marginTop: 4 }}>
                  {f.description}
                </div>
              ) : null}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Pill
                color={f.enabled ? T.green : T.inkDim}
                active={f.enabled}
                disabled={busy === f.key}
                onClick={() => void toggle(f.key, !f.enabled)}
              >
                {busy === f.key ? "…" : f.enabled ? "ON" : "OFF"}
              </Pill>
            </div>
          </div>
        ))}

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
