/**
 * Local procurement settings — the VA ABC home store number. This is the anchor
 * for "nearest store in stock" lookups on the catalog + bottle detail. It's an
 * operator setting (persisted server-side via /settings), NOT an env var, so it
 * takes effect immediately without a restart.
 *
 * Pairs with the "VA ABC local stock" feature flag (below in Settings); both
 * must be set for the local-stock cell to appear.
 */
import { useEffect, useState } from "react";
import { api } from "../api/client";
import { Cell, Pill } from "../console/Cells";
import { T } from "../console/tokens";
import { useStore } from "../store/useStore";

const HOME_STORE_KEY = "va_abc.home_store";

export function SettingsProcurement() {
  const flagOn = useStore((s) => s.flags.find((f) => f.key === "va-abc")?.enabled ?? false);
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .settings()
      .then((s) => {
        if (!alive) return;
        const v = s[HOME_STORE_KEY] ?? "";
        setValue(v);
        setSaved(v);
      })
      .catch(() => {
        /* leave blank */
      });
    return () => {
      alive = false;
    };
  }, []);

  const dirty = value.trim() !== (saved ?? "");

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const trimmed = value.trim();
      const res = await api.setSetting(HOME_STORE_KEY, trimmed === "" ? null : trimmed);
      const next = res.value ?? "";
      setValue(next);
      setSaved(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Cell title="LOCAL PROCUREMENT · VA ABC" right={flagOn ? "flag on" : "flag off"}>
      <div style={{ paddingTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 11, color: T.inkMuted, lineHeight: 1.5 }}>
          Your nearest Virginia ABC store number — the anchor for "nearest store in stock" on the
          catalog &amp; bottle detail. Find it via the{" "}
          <a
            href="https://www.abc.virginia.gov/stores"
            target="_blank"
            rel="noreferrer"
            style={{ color: T.cyan }}
          >
            ABC store locator
          </a>{" "}
          ("ABC Store 088" → 88).
          {flagOn ? null : (
            <>
              {" "}
              Also turn on the <strong style={{ color: T.amber }}>VA ABC local stock</strong> feature
              flag below.
            </>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={value}
            placeholder="e.g. 88"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && dirty && !busy) void save();
            }}
            style={{
              width: 120,
              padding: "6px 10px",
              background: T.bg,
              border: `1px solid ${T.hairline2}`,
              color: T.ink,
              fontFamily: T.mono,
              fontSize: 13,
            }}
          />
          <Pill color={dirty ? T.green : T.inkDim} active={dirty} disabled={busy || !dirty} onClick={() => void save()}>
            {busy ? "…" : dirty ? "SAVE" : "SAVED"}
          </Pill>
          {saved ? (
            <span style={{ fontFamily: T.mono, fontSize: 10, color: T.inkDim }}>
              current: {saved || "unset"}
            </span>
          ) : null}
        </div>

        {error ? (
          <div
            style={{
              padding: "8px 10px",
              background: T.redGlow,
              border: `1px solid ${T.red}`,
              color: T.red,
              fontFamily: T.mono,
              fontSize: 11,
            }}
          >
            ⚠ {error}
          </div>
        ) : null}
      </div>
    </Cell>
  );
}
