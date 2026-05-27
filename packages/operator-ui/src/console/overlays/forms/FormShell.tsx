/**
 * Shared modal shell for the small entry forms (Add Product / Add Bottle /
 * Add Recipe / Import Photo). Provides the dimmed backdrop, close button,
 * header strip, and primary/secondary action footer. Each form owns its
 * own field layout + submit handler — this is just chrome.
 *
 * On mobile (< 768px) the dialog goes full-screen edge-to-edge so the form
 * has room to breathe and the on-screen keyboard doesn't fight the layout.
 */
import type { ReactNode } from "react";
import { T } from "../../tokens";
import { useViewport } from "../../../util/useViewport";

interface Props {
  title: string;
  subtitle?: string;
  onClose(): void;
  onSubmit(): void;
  submitLabel?: string;
  submitDisabled?: boolean;
  submitting?: boolean;
  error?: string | null;
  width?: number;
  children: ReactNode;
}

export function FormShell({
  title,
  subtitle,
  onClose,
  onSubmit,
  submitLabel = "✓ SAVE",
  submitDisabled,
  submitting,
  error,
  width = 560,
  children,
}: Props) {
  const { isMobile } = useViewport();
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
        alignItems: isMobile ? "stretch" : "center",
        justifyContent: "center",
        padding: isMobile ? 0 : 40,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: isMobile ? "100%" : width,
          maxWidth: isMobile ? "100%" : "100%",
          maxHeight: isMobile ? "100%" : "85vh",
          height: isMobile ? "100%" : "auto",
          background: T.surface,
          border: isMobile ? "none" : `1px solid ${T.hairline2}`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative",
          boxShadow: isMobile ? "none" : "0 24px 80px rgba(0,0,0,0.7)",
          paddingTop: isMobile ? "var(--safe-top, 0px)" : 0,
          paddingBottom: isMobile ? "var(--safe-bottom, 0px)" : 0,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="close"
          style={{
            position: "absolute",
            top: isMobile ? "calc(var(--safe-top, 0px) + 12px)" : 14,
            right: 14,
            width: isMobile ? 40 : 30,
            height: isMobile ? 40 : 30,
            background: "transparent",
            border: `1px solid ${T.hairline2}`,
            color: T.inkMuted,
            fontFamily: T.mono,
            fontSize: isMobile ? 16 : 14,
            cursor: "pointer",
            zIndex: 2,
          }}
        >
          ✕
        </button>

        <div style={{ padding: isMobile ? "20px 18px 12px" : "24px 28px 12px", borderBottom: `1px solid ${T.hairline}` }}>
          <div style={{ fontSize: 10, fontFamily: T.mono, color: T.cyan, letterSpacing: "0.18em" }}>NEW</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: T.ink, marginTop: 4, letterSpacing: "-0.01em" }}>
            {title}
          </div>
          {subtitle ? (
            <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 6, lineHeight: 1.5 }}>{subtitle}</div>
          ) : null}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (submitting || submitDisabled) return;
            onSubmit();
          }}
          style={{
            padding: isMobile ? "14px 18px 24px" : "16px 28px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            overflow: "auto",
            flex: 1,
          }}
        >
          {children}

          {error ? (
            <div
              style={{
                padding: "10px 12px",
                fontSize: 11,
                color: T.red,
                background: T.redGlow,
                border: `1px solid ${T.red}`,
                fontFamily: T.mono,
                lineHeight: 1.5,
              }}
            >
              ⚠ {error}
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: isMobile ? "14px 16px" : "10px 16px",
                minHeight: isMobile ? 48 : "auto",
                background: "transparent",
                color: T.inkMuted,
                border: `1px solid ${T.hairline2}`,
                fontFamily: T.mono,
                fontSize: isMobile ? 12 : 11,
                letterSpacing: "0.14em",
                cursor: "pointer",
              }}
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={submitDisabled || submitting}
              style={{
                flex: 1,
                padding: isMobile ? "14px 16px" : "10px 16px",
                minHeight: isMobile ? 48 : "auto",
                background: submitDisabled || submitting ? T.surface2 : T.cyan,
                color: submitDisabled || submitting ? T.inkMuted : T.bg,
                border: "none",
                fontFamily: T.mono,
                fontSize: isMobile ? 13 : 12,
                letterSpacing: "0.14em",
                fontWeight: 600,
                cursor: submitDisabled || submitting ? "not-allowed" : "pointer",
              }}
            >
              {submitting ? "SAVING…" : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Labeled input row. */
export function FormRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 10, color: T.inkMuted, letterSpacing: "0.14em" }}>{label.toUpperCase()}</span>
      {children}
      {hint ? (
        <span style={{ fontSize: 10, color: T.inkDim, fontFamily: T.mono, lineHeight: 1.4 }}>{hint}</span>
      ) : null}
    </label>
  );
}

/** Plain dark input — matches the rest of the Console palette. */
export function FormInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        width: "100%",
        boxSizing: "border-box",
        background: T.surface2,
        border: `1px solid ${T.hairline2}`,
        color: T.ink,
        fontFamily: T.mono,
        fontSize: 13,
        padding: "6px 10px",
        outline: "none",
        borderRadius: 0,
        ...(props.style ?? {}),
      }}
    />
  );
}

export function FormTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      style={{
        width: "100%",
        boxSizing: "border-box",
        display: "block",
        background: T.surface2,
        border: `1px solid ${T.hairline2}`,
        color: T.ink,
        fontFamily: T.body,
        fontSize: 13,
        padding: "8px 10px",
        outline: "none",
        borderRadius: 0,
        resize: "vertical",
        ...(props.style ?? {}),
      }}
    />
  );
}

/** Slug helper used by Add Product / Add Recipe (id field auto-fills from name). */
export function toSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
