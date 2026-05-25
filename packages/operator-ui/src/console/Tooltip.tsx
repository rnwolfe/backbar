/**
 * Hover tooltip — portal-rendered into document.body so it escapes the
 * overflow:hidden cells. Console-themed, no delay, smart-flip from above to
 * below when there's no room. Use anywhere you'd otherwise hang a `title=`
 * attribute and want real formatting.
 *
 *   <Tooltip content={<>day 1<br/>27 pours</>}>
 *     <div className="bar"/>
 *   </Tooltip>
 *
 * Implementation note: we attach the trigger ref to the *child* element via
 * cloneElement. An earlier version wrapped children in a span with
 * `display: contents`, which has no bounding rect — every tooltip rendered
 * at (0,0). The child must therefore be a single React element that accepts
 * a ref (a plain DOM element or a forwardRef component); plain text or
 * fragments won't work.
 */
import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { T } from "./tokens";

interface Props {
  content: ReactNode;
  /** Where to anchor the popup relative to the trigger. Defaults to "top". */
  placement?: "top" | "bottom";
  /** Disabled tooltips skip listener attachment entirely. */
  disabled?: boolean;
  children: ReactNode;
  /** Width hint for the popup — varies by content density. */
  maxWidth?: number;
}

interface RefAware {
  ref?: Ref<HTMLElement>;
}

export function Tooltip({ content, placement = "top", disabled, children, maxWidth = 260 }: Props) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number; placement: "top" | "bottom" } | null>(null);

  useEffect(() => {
    if (disabled) return;
    const el = triggerRef.current;
    if (!el) return;
    const onEnter = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        // Trigger element has no layout box (display:none, etc.) — skip.
        return;
      }
      const fitsTop = rect.top > 80;
      const final: "top" | "bottom" =
        placement === "top" ? (fitsTop ? "top" : "bottom") : placement;
      setPos({
        x: rect.left + rect.width / 2,
        y: final === "top" ? rect.top - 6 : rect.bottom + 6,
        placement: final,
      });
    };
    const onLeave = () => setPos(null);
    el.addEventListener("mouseenter", onEnter);
    el.addEventListener("mouseleave", onLeave);
    el.addEventListener("focusin", onEnter);
    el.addEventListener("focusout", onLeave);
    return () => {
      el.removeEventListener("mouseenter", onEnter);
      el.removeEventListener("mouseleave", onLeave);
      el.removeEventListener("focusin", onEnter);
      el.removeEventListener("focusout", onLeave);
    };
    // re-run if the trigger element identity changes (re-mount/re-render replaces the DOM node)
  }, [placement, disabled, triggerRef.current]);

  // Attach our ref to the child element. If callers passed their own ref,
  // forward it as well so this composition is transparent.
  let cloned: ReactNode = children;
  const onlyChild = Children.count(children) === 1 ? Children.only(children) : null;
  if (onlyChild && isValidElement(onlyChild)) {
    const existingRef = (onlyChild as ReactElement & RefAware).ref;
    cloned = cloneElement(onlyChild as ReactElement<unknown> & RefAware, {
      ref: (node: HTMLElement | null) => {
        triggerRef.current = node;
        if (typeof existingRef === "function") existingRef(node);
        else if (existingRef && typeof existingRef === "object") {
          (existingRef as { current: HTMLElement | null }).current = node;
        }
      },
    } as Partial<RefAware>);
  }

  return (
    <>
      {cloned}
      {pos
        ? createPortal(
            <div
              role="tooltip"
              style={{
                position: "fixed",
                left: pos.x,
                top: pos.y,
                transform:
                  pos.placement === "top" ? "translate(-50%, -100%)" : "translate(-50%, 0)",
                background: T.surface,
                border: `1px solid ${T.hairline2}`,
                color: T.ink,
                fontFamily: T.body,
                fontSize: 12,
                lineHeight: 1.45,
                padding: "8px 10px",
                maxWidth,
                pointerEvents: "none",
                boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                zIndex: 1000,
                whiteSpace: "normal",
              }}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/**
 * Tiny helper for the common case: 2-3 lines of label/value pairs that
 * read like a tabular tooltip.
 */
export function TooltipRows({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
          <span
            style={{
              fontSize: 9,
              fontFamily: T.mono,
              color: T.inkMuted,
              letterSpacing: "0.12em",
              minWidth: 60,
            }}
          >
            {r.label.toUpperCase()}
          </span>
          <span style={{ fontSize: 12, color: T.ink, fontWeight: 500 }}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}
