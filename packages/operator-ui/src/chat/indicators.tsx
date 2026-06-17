import { useEffect, useState } from "react";
import { T } from "../console/tokens";

/** Cycling "·· ·" dots — no CSS keyframes needed. */
export function ThinkingDots({ label }: { label?: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((x) => (x + 1) % 4), 350);
    return () => clearInterval(t);
  }, []);
  return (
    <span style={{ color: T.inkMuted, fontFamily: T.mono, fontSize: 12 }}>
      {label ? `${label} ` : ""}
      {".".repeat(n).padEnd(3, " ")}
    </span>
  );
}

export function StateBadge({ state }: { state: string }) {
  const map: Record<string, { label: string; color: string }> = {
    "input-streaming": { label: "…", color: T.inkMuted },
    "input-available": { label: "running", color: T.amber },
    "output-available": { label: "done", color: T.green },
    "output-error": { label: "error", color: T.red },
  };
  const s = map[state] ?? { label: state, color: T.inkMuted };
  return (
    <span
      style={{
        fontFamily: T.mono,
        fontSize: 9,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: s.color,
        border: `1px solid ${s.color}`,
        borderRadius: 2,
        padding: "0 4px",
      }}
    >
      {s.label}
    </span>
  );
}
