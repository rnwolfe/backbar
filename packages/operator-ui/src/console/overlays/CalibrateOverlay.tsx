/**
 * 2-point per-channel calibration capture.
 *
 * Flow:
 *   1. PUT the channel into identity-cal mode (slope=1, offset=0) so the
 *      device starts publishing raw HX711 counts in `raw_g`.
 *   2. Poll /nodes/<id>/channels/<n>/sample at 500ms; show the live value.
 *   3. Operator removes the bottle → "Capture empty" freezes empty_raw.
 *   4. Operator places a known mass + enters its weight → "Capture known"
 *      freezes known_raw.
 *   5. POST /nodes/<id>/calibrate; server computes slope+offset, pushes
 *      via MQTT, channel is now calibrated.
 */
import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { Cell, Pill } from "../Cells";
import { T } from "../tokens";

type Step = "preparing" | "empty" | "known" | "submitting" | "done";

interface Props {
  deviceId: string;
  channel: number;
  onClose(): void;
  onToast?(text: string): void;
}

export function CalibrateOverlay({ deviceId, channel, onClose, onToast }: Props) {
  const [step, setStep] = useState<Step>("preparing");
  const [live, setLive] = useState<number | null>(null);
  const [lastSampleTs, setLastSampleTs] = useState<number | null>(null);
  const [emptyRaw, setEmptyRaw] = useState<number | null>(null);
  const [knownRaw, setKnownRaw] = useState<number | null>(null);
  const [knownG, setKnownG] = useState<string>("500");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ slope: number; offset: number } | null>(null);
  const mountedRef = useRef(true);

  // On mount: identity-cal reset, then start polling.
  useEffect(() => {
    mountedRef.current = true;
    api
      .resetCalibration(deviceId, channel)
      .then(() => {
        if (mountedRef.current) setStep("empty");
      })
      .catch((e: unknown) => {
        if (mountedRef.current) {
          setError(e instanceof Error ? e.message : "reset failed");
        }
      });
    return () => {
      mountedRef.current = false;
    };
  }, [deviceId, channel]);

  // Live polling.
  useEffect(() => {
    if (step !== "empty" && step !== "known") return;
    let alive = true;
    const tick = async () => {
      try {
        const s = await api.channelSample(deviceId, channel);
        if (!alive) return;
        setLive(s.raw_g);
        setLastSampleTs(s.ts);
      } catch {
        // 404 no-sample is expected until first MQTT reading arrives — keep polling.
      }
    };
    void tick();
    const id = setInterval(tick, 500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [deviceId, channel, step]);

  const captureEmpty = () => {
    if (live == null) return;
    setEmptyRaw(live);
    setStep("known");
  };

  const captureKnown = async () => {
    if (live == null || emptyRaw == null) return;
    setKnownRaw(live);
    const known_g = Number.parseFloat(knownG);
    if (!Number.isFinite(known_g) || known_g <= 0) {
      setError("known mass must be a positive number of grams");
      return;
    }
    setStep("submitting");
    setError(null);
    try {
      const res = await api.applyCalibration(deviceId, {
        channel,
        empty_raw: emptyRaw,
        known_raw: live,
        known_g,
      });
      if (!mountedRef.current) return;
      setResult(res.cal);
      setStep("done");
      onToast?.(`channel ${deviceId}/${channel} calibrated · slope ${res.cal.slope.toFixed(4)}`);
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : "calibration submit failed");
      setStep("known"); // back to capture step so user can retry
    }
  };

  const ageS = lastSampleTs ? Math.max(0, Math.round((Date.now() - lastSampleTs) / 1000)) : null;
  const liveStale = ageS != null && ageS > 5;

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
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 40,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 600,
          maxHeight: "85vh",
          background: T.surface,
          border: `1px solid ${T.hairline2}`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative",
          boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="close"
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            width: 30,
            height: 30,
            background: "transparent",
            border: `1px solid ${T.hairline2}`,
            color: T.inkMuted,
            fontFamily: T.mono,
            fontSize: 14,
            cursor: "pointer",
            zIndex: 2,
          }}
        >
          ✕
        </button>

        <div style={{ padding: "24px 28px 12px", borderBottom: `1px solid ${T.hairline}` }}>
          <div style={{ fontSize: 10, fontFamily: T.mono, color: T.cyan, letterSpacing: "0.18em" }}>
            CALIBRATE · 2-POINT
          </div>
          <div style={{ fontSize: 24, fontWeight: 600, color: T.ink, marginTop: 4, letterSpacing: "-0.01em" }}>
            {deviceId} / CH{String(channel).padStart(2, "0")}
          </div>
          <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 6, lineHeight: 1.5 }}>
            Channel is in identity-cal mode — the live value below is the raw HX711 count.
            Capture empty, place a known mass, capture again, then submit.
          </div>
        </div>

        <div style={{ padding: "16px 28px", display: "flex", flexDirection: "column", gap: 14, overflow: "auto" }}>
          {step === "preparing" ? (
            <div style={{ fontSize: 13, color: T.inkMuted, fontFamily: T.mono }}>
              Pushing identity-cal config…
            </div>
          ) : null}

          {step !== "preparing" && step !== "done" ? (
            <LiveBox value={live} stale={liveStale} ageS={ageS} />
          ) : null}

          {step === "empty" ? (
            <Cell title="STEP 1 · EMPTY CHANNEL">
              <div style={{ fontSize: 12, color: T.inkMuted, lineHeight: 1.5, paddingTop: 4 }}>
                Remove anything sitting on the load cell. Wait for the value above to stop
                drifting, then capture.
              </div>
              <button
                type="button"
                disabled={live == null}
                onClick={captureEmpty}
                style={primaryBtn(live != null)}
              >
                ✓ CAPTURE EMPTY
              </button>
            </Cell>
          ) : null}

          {step === "known" || step === "submitting" ? (
            <Cell title="STEP 2 · KNOWN MASS" right={emptyRaw != null ? `empty=${emptyRaw.toFixed(0)}` : ""}>
              <div style={{ fontSize: 12, color: T.inkMuted, lineHeight: 1.5, paddingTop: 4 }}>
                Place a known weight on the cell (500g is the convention — a sealed water
                bottle weighed on a kitchen scale also works). Enter its actual mass in grams.
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "baseline" }}>
                <label style={{ fontSize: 10, color: T.inkMuted, letterSpacing: "0.14em", width: 80 }}>
                  KNOWN g
                </label>
                <input
                  type="number"
                  value={knownG}
                  onChange={(e) => setKnownG(e.target.value)}
                  disabled={step === "submitting"}
                  style={{
                    flex: 1,
                    background: T.surface2,
                    border: `1px solid ${T.hairline2}`,
                    color: T.ink,
                    fontFamily: T.mono,
                    fontSize: 14,
                    padding: "6px 10px",
                    outline: "none",
                  }}
                />
              </div>
              <button
                type="button"
                disabled={live == null || step === "submitting"}
                onClick={() => void captureKnown()}
                style={primaryBtn(live != null && step !== "submitting")}
              >
                {step === "submitting" ? "SUBMITTING…" : "✓ CAPTURE + SUBMIT"}
              </button>
              {knownRaw != null ? (
                <div style={{ fontSize: 10, fontFamily: T.mono, color: T.inkDim, marginTop: 6 }}>
                  known_raw = {knownRaw.toFixed(0)}
                </div>
              ) : null}
            </Cell>
          ) : null}

          {step === "done" && result ? (
            <Cell title="DONE · CHANNEL CALIBRATED" right="server pushed config">
              <div style={{ fontFamily: T.mono, fontSize: 13, color: T.ink, lineHeight: 1.8, paddingTop: 6 }}>
                slope · <span style={{ color: T.green }}>{result.slope.toFixed(6)} g/raw</span>
                <br />
                offset · <span style={{ color: T.green }}>{result.offset.toFixed(2)}</span>
              </div>
              <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 8, lineHeight: 1.5 }}>
                Persisted to <code style={{ color: T.ink }}>sensor_channel</code> and pushed to the
                node via <code style={{ color: T.ink }}>backbar/{deviceId}/config</code>. The
                firmware will save it to EEPROM/NVS on receipt — survives reboot.
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <Pill color={T.green} active onClick={onClose}>
                  CLOSE
                </Pill>
              </div>
            </Cell>
          ) : null}

          {error ? (
            <div
              style={{
                padding: "10px 12px",
                fontSize: 11,
                color: T.red,
                background: T.redGlow,
                border: `1px solid ${T.red}`,
                fontFamily: T.mono,
              }}
            >
              ⚠ {error}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function LiveBox({ value, stale, ageS }: { value: number | null; stale: boolean; ageS: number | null }) {
  return (
    <div
      style={{
        background: T.surface2,
        border: `1px solid ${stale ? T.amber : T.hairline2}`,
        padding: "12px 16px",
        display: "flex",
        alignItems: "baseline",
        gap: 10,
      }}
    >
      <div style={{ fontSize: 10, fontFamily: T.mono, color: T.inkMuted, letterSpacing: "0.16em", width: 80 }}>
        LIVE
      </div>
      <div
        style={{
          fontFamily: T.mono,
          fontSize: 32,
          color: value == null ? T.inkDim : stale ? T.amber : T.cyan,
          fontWeight: 500,
          letterSpacing: "-0.02em",
          flex: 1,
        }}
      >
        {value != null ? value.toFixed(1) : "—"}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: 10, color: stale ? T.amber : T.inkDim }}>
        {ageS != null ? (stale ? `STALE ${ageS}s` : `${ageS}s ago`) : "no sample yet"}
      </div>
    </div>
  );
}

function primaryBtn(enabled: boolean) {
  return {
    marginTop: 12,
    padding: "10px 0",
    background: enabled ? T.cyan : T.surface,
    color: enabled ? T.bg : T.inkMuted,
    border: "none",
    fontFamily: T.mono,
    fontSize: 12,
    letterSpacing: "0.14em",
    fontWeight: 600,
    cursor: enabled ? ("pointer" as const) : ("not-allowed" as const),
    width: "100%",
  } as const;
}
