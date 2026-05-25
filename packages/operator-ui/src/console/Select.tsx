/**
 * Console-themed select — replaces browser-native <select> which pops a
 * platform-default dropdown that breaks the dark-monospace look.
 *
 * Keyboard:
 *   Enter / Space / ArrowDown — open
 *   ArrowUp / ArrowDown — navigate
 *   Enter — pick highlighted option
 *   Escape — close without changing selection
 *   Type characters — jump to first matching option
 *
 * Renders the popup via portal so it escapes overflow:hidden containers
 * (forms inside modals, etc.). Matches FormInput visually when closed.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { T } from "./tokens";

export interface ConSelectOption<V extends string> {
  value: V;
  label: string;
  hint?: string;
}

interface Props<V extends string> {
  value: V;
  options: ConSelectOption<V>[] | readonly V[];
  onChange(v: V): void;
  disabled?: boolean;
  placeholder?: string;
  style?: CSSProperties;
  /** Allow callers to provide their own per-option key when label collides. */
  id?: string;
  ariaLabel?: string;
}

export function ConSelect<V extends string>({
  value,
  options,
  onChange,
  disabled,
  placeholder = "— pick —",
  style,
  id,
  ariaLabel,
}: Props<V>) {
  // Normalize to { value, label } pairs internally.
  const normalized = useMemo<ConSelectOption<V>[]>(
    () =>
      (options as readonly (V | ConSelectOption<V>)[]).map((o) =>
        typeof o === "string"
          ? ({ value: o as V, label: o as V } satisfies ConSelectOption<V>)
          : (o as ConSelectOption<V>),
      ),
    [options],
  );

  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [rect, setRect] = useState<{ x: number; y: number; w: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);

  const selected = normalized.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const t = triggerRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    setRect({ x: r.left, y: r.bottom + 2, w: r.width });
    setCursor(Math.max(0, normalized.findIndex((o) => o.value === value)));
    const onDown = (e: MouseEvent) => {
      if (popupRef.current?.contains(e.target as Node) || triggerRef.current?.contains(e.target as Node)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, normalized, value]);

  const pick = (i: number) => {
    const opt = normalized[i];
    if (!opt) return;
    onChange(opt.value);
    setOpen(false);
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement | HTMLDivElement>) => {
    if (disabled) return;
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(normalized.length - 1, c + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      pick(cursor);
      return;
    }
    // Typeahead — single-char jump.
    if (e.key.length === 1 && /\S/.test(e.key)) {
      const ch = e.key.toLowerCase();
      const next = normalized.findIndex((o, i) => i > cursor && o.label.toLowerCase().startsWith(ch));
      const found = next >= 0 ? next : normalized.findIndex((o) => o.label.toLowerCase().startsWith(ch));
      if (found >= 0) setCursor(found);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        style={{
          background: T.surface2,
          border: `1px solid ${open ? T.cyan : T.hairline2}`,
          color: T.ink,
          fontFamily: T.mono,
          fontSize: 13,
          padding: "6px 10px",
          textAlign: "left",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          width: "100%",
          outline: "none",
          ...style,
        }}
      >
        <span
          style={{
            flex: 1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            color: selected ? T.ink : T.inkDim,
          }}
        >
          {selected?.label ?? placeholder}
        </span>
        <span style={{ fontSize: 10, color: T.inkMuted, transform: open ? "rotate(180deg)" : "none" }}>▾</span>
      </button>

      {open && rect
        ? createPortal(
            <div
              ref={popupRef}
              role="listbox"
              style={{
                position: "fixed",
                left: rect.x,
                top: rect.y,
                minWidth: rect.w,
                maxHeight: 280,
                overflowY: "auto",
                background: T.surface,
                border: `1px solid ${T.cyan}`,
                boxShadow: "0 12px 32px rgba(0,0,0,0.6)",
                zIndex: 1100,
              }}
            >
              {normalized.map((opt, i) => {
                const sel = opt.value === value;
                const hi = i === cursor;
                return (
                  <div
                    key={opt.value}
                    role="option"
                    aria-selected={sel}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => pick(i)}
                    style={{
                      padding: "6px 10px",
                      cursor: "pointer",
                      background: hi ? T.cyanGlow : sel ? T.surface2 : "transparent",
                      color: sel ? T.ink : T.inkMuted,
                      fontFamily: T.mono,
                      fontSize: 13,
                      borderLeft: `2px solid ${hi ? T.cyan : "transparent"}`,
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {opt.label}
                    </span>
                    {opt.hint ? (
                      <span style={{ fontSize: 10, color: T.inkDim, fontFamily: T.mono }}>{opt.hint}</span>
                    ) : null}
                    {sel ? <span style={{ color: T.cyan, fontSize: 11 }}>✓</span> : null}
                  </div>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
