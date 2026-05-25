/**
 * Per-bottle tare capture.
 *
 * Place the empty bottle on its mapped channel; the live reading (cal'd gross
 * grams) IS the bottle's tare weight. PATCH /bottles/<id> {tare_g} writes it.
 *
 * Requires the bottle to already be mapped to a calibrated sensor channel.
 * Manual (tracked=false) bottles surface a friendly "no channel" hint instead.
 */
import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import type { DecoratedBottle } from "../../data/derive";
import { Cell, Pill } from "../Cells";
import { T } from "../tokens";

type Step = "capture" | "submitting" | "done";

interface Props {
  bottle: DecoratedBottle;
  onClose(): void;
  onToast?(text: string): void;
}

export function TareOverlay({ bottle, onClose, onToast }: Props) {
  const [step, setStep] = useState<Step>("capture");
  const [live, setLive] = useState<number | null>(null);
  const [lastSampleTs, setLastSampleTs] = useState<number | null>(null);
  const [channelLabel, setChannelLabel] = useState<string | null>(null);
  const [captured, setCaptured] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noChannel, setNoChannel] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let alive = true;
    const tick = async () => {
      try {
        const s = await api.bottleSample(bottle.id);
        if (!alive) return;
        setLive(s.raw_g);
        setLastSampleTs(s.ts);
        setChannelLabel(`${s.channel_info.device_id}/CH${String(s.channel_info.channel).padStart(2, "0")}`);
        setError(null);
        setNoChannel(false);
      } catch (e) {
        if (!alive) return;
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("no-channel")) {
          setNoChannel(true);
        }
        // Suppress no-sample/no-channel as the steady-state error — surface
        // anything else.
        if (!msg.includes("no-sample") && !msg.includes("no-channel")) {
          setError(msg);
        }
      }
    };
    void tick();
    const id = setInterval(tick, 500);
    return () => {
      alive = false;
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [bottle.id]);

  const capture = () => {
    if (live == null) return;
    setCaptured(live);
  };

  const submit = async () => {
    if (captured == null) return;
    setStep("submitting");
    try {
      await api.patchBottle(bottle.id, { tare_g: captured });
      if (!mountedRef.current) return;
      setStep("done");
      onToast?.(`tare set · ${bottle.name} = ${captured.toFixed(1)}g`);
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : "patch failed");
      setStep("capture");
    }
  };

  const ageS = lastSampleTs ? Math.max(0, Math.round((Date.now() - lastSampleTs) / 1000)) : null;
  const stale = ageS != null && ageS > 5;

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
          width: 560,
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
            TARE · BOTTLE EMPTY WEIGHT
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, color: T.ink, marginTop: 4, letterSpacing: "-0.01em" }}>
            {bottle.name}
          </div>
          <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 6, lineHeight: 1.5 }}>
            {channelLabel
              ? `Bound to ${channelLabel}. Place the empty bottle on the cell and capture.`
              : "Looking up channel binding…"}
          </div>
        </div>

        <div style={{ padding: "16px 28px", display: "flex", flexDirection: "column", gap: 14, overflow: "auto" }}>
          {noChannel ? (
            <Cell padded>
              <div style={{ fontSize: 13, color: T.inkMuted, lineHeight: 1.6, padding: "8px 0" }}>
                This bottle isn't mapped to a sensor channel — typically because{" "}
                <code style={{ color: T.ink }}>tracked=false</code> (manual bottle), or no channel
                has been assigned yet. Set the slot on the bottle and map it under the Shelf tab,
                then come back.
              </div>
            </Cell>
          ) : (
            <>
              <LiveBox value={live} stale={stale} ageS={ageS} />
              {captured == null ? (
                <Cell title="STEP 1 · PLACE EMPTY BOTTLE">
                  <div style={{ fontSize: 12, color: T.inkMuted, lineHeight: 1.5, paddingTop: 4 }}>
                    The value above is gross grams on the cell — that's the tare you want when the
                    bottle is empty. Wait for it to stop drifting, then capture.
                  </div>
                  <button
                    type="button"
                    disabled={live == null}
                    onClick={capture}
                    style={primaryBtn(live != null)}
                  >
                    ✓ CAPTURE TARE
                  </button>
                </Cell>
              ) : (
                <Cell title="STEP 2 · CONFIRM" right={`captured ${captured.toFixed(1)}g`}>
                  <div style={{ fontSize: 12, color: T.inkMuted, lineHeight: 1.5, paddingTop: 4 }}>
                    Writes <code style={{ color: T.ink }}>tare_g={captured.toFixed(1)}</code> on{" "}
                    <code style={{ color: T.ink }}>{bottle.id}</code>. Future weight readings will
                    subtract this before computing level_ml.
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button
                      type="button"
                      onClick={() => setCaptured(null)}
                      style={secondaryBtn()}
                    >
                      RECAPTURE
                    </button>
                    <button
                      type="button"
                      onClick={() => void submit()}
                      disabled={step === "submitting"}
                      style={primaryBtn(step !== "submitting")}
                    >
                      {step === "submitting" ? "SAVING…" : "✓ CONFIRM"}
                    </button>
                  </div>
                </Cell>
              )}

              {step === "done" ? (
                <Cell title="DONE">
                  <div style={{ fontSize: 13, color: T.green, fontFamily: T.mono, paddingTop: 6 }}>
                    ✓ tare_g = {captured?.toFixed(1)}g persisted
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <Pill color={T.green} active onClick={onClose}>
                      CLOSE
                    </Pill>
                  </div>
                </Cell>
              ) : null}
            </>
          )}

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
        LIVE GROSS
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
        {value != null ? `${value.toFixed(1)}g` : "—"}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: 10, color: stale ? T.amber : T.inkDim }}>
        {ageS != null ? (stale ? `STALE ${ageS}s` : `${ageS}s ago`) : "no sample yet"}
      </div>
    </div>
  );
}

function primaryBtn(enabled: boolean) {
  return {
    marginTop: 4,
    padding: "10px 0",
    background: enabled ? T.cyan : T.surface,
    color: enabled ? T.bg : T.inkMuted,
    border: "none",
    fontFamily: T.mono,
    fontSize: 12,
    letterSpacing: "0.14em",
    fontWeight: 600,
    cursor: enabled ? ("pointer" as const) : ("not-allowed" as const),
    flex: 1,
  } as const;
}

function secondaryBtn() {
  return {
    padding: "10px 0",
    background: "transparent",
    color: T.inkMuted,
    border: `1px solid ${T.hairline2}`,
    fontFamily: T.mono,
    fontSize: 12,
    letterSpacing: "0.14em",
    cursor: "pointer" as const,
    flex: 1,
  } as const;
}
