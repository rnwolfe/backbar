/**
 * Guest-menu QR overlay. Renders the URL as an SVG QR locally (no network
 * call to a QR service — keeps the guest URL on-host), with download + copy
 * actions for the operator.
 */
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Pill } from "../Cells";
import { T } from "../tokens";

interface Props {
  url: string;
  onClose(): void;
  onToast?(text: string): void;
}

export function QrCodeOverlay({ url, onClose, onToast }: Props) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    QRCode.toString(url, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 2,
      color: { dark: T.ink, light: T.surface },
    })
      .then((s) => {
        if (alive) setSvg(s);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "QR generation failed");
      });
    return () => {
      alive = false;
    };
  }, [url]);

  const downloadSvg = () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "backbar-guest-menu.svg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
      onToast?.(`copied ${url}`);
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : "copy failed");
    }
  };

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
          width: 480,
          background: T.surface,
          border: `1px solid ${T.hairline2}`,
          padding: "28px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
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
          }}
        >
          ✕
        </button>

        <div>
          <div style={{ fontSize: 10, fontFamily: T.mono, color: T.cyan, letterSpacing: "0.18em" }}>
            GUEST MENU · QR
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, color: T.ink, marginTop: 4, letterSpacing: "-0.01em" }}>
            Scan to view tonight's list
          </div>
          <div
            style={{
              fontSize: 11,
              color: T.inkMuted,
              marginTop: 6,
              fontFamily: T.mono,
              wordBreak: "break-all",
            }}
          >
            {url}
          </div>
        </div>

        <div
          style={{
            background: T.surface,
            border: `1px solid ${T.hairline2}`,
            padding: 16,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            aspectRatio: "1/1",
          }}
        >
          {error ? (
            <div style={{ fontSize: 12, color: T.red, fontFamily: T.mono }}>⚠ {error}</div>
          ) : svg ? (
            <div
              style={{ width: "100%", maxWidth: 340 }}
              dangerouslySetInnerHTML={{ __html: svg }}
              aria-label={`QR code for ${url}`}
            />
          ) : (
            <div style={{ fontSize: 12, color: T.inkMuted, fontFamily: T.mono }}>generating…</div>
          )}
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <Pill color={T.cyan} active onClick={downloadSvg} disabled={!svg}>
            ↓ DOWNLOAD SVG
          </Pill>
          <Pill onClick={() => void copyUrl()}>📋 COPY URL</Pill>
          <Pill onClick={() => window.print()}>PRINT</Pill>
        </div>
      </div>
    </div>
  );
}
