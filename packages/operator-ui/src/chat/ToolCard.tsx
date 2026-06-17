/**
 * Expandable tool-call card. A v5 tool part is a state machine
 * (input-streaming → input-available → output-available → output-error); the
 * card reflects it, collapses to one line, and renders a tool-specific result
 * when available (balance bars, pairing/substitute chips, …).
 */
import { useState } from "react";
import { T } from "../console/tokens";
import { EntityChip } from "./EntityChip";
import { StateBadge } from "./indicators";

interface ToolPart {
  toolName: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

const PRETTY: Record<string, string> = {
  check_balance: "checking balance",
  compute_dilution: "computing dilution",
  classify_family: "classifying family",
  suggest_ratio: "suggesting ratio",
  shake_or_stir: "shake or stir",
  flavor_profile: "flavor profile",
  pairing_score: "pairing score",
  top_pairings: "top pairings",
  flavor_similar: "substitutes",
  check_makeable: "checking inventory",
  score_food_pairing: "food pairing",
};

export function ToolCard({ part }: { part: ToolPart }) {
  const [open, setOpen] = useState(false);
  const done = part.state === "output-available";
  const label = PRETTY[part.toolName] ?? part.toolName;

  return (
    <div style={{ border: `1px solid ${T.hairline2}`, background: T.surface, fontSize: 12 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 9px",
          background: "transparent",
          border: "none",
          color: T.ink,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ color: T.inkDim, fontFamily: T.mono, fontSize: 10 }}>{open ? "▾" : "▸"}</span>
        <span style={{ fontFamily: T.mono, fontSize: 11, color: T.inkMuted }}>⚙ {label}</span>
        <span style={{ flex: 1 }} />
        <StateBadge state={part.state} />
      </button>
      {open ? (
        <div style={{ padding: "0 9px 9px", display: "grid", gap: 8 }}>
          {part.input != null ? (
            <Section title="args">
              <Json value={part.input} />
            </Section>
          ) : null}
          {part.state === "output-error" ? (
            <div style={{ color: T.red, fontFamily: T.mono, fontSize: 11 }}>{part.errorText}</div>
          ) : done ? (
            <Section title="result">
              <ToolResult toolName={part.toolName} output={part.output} />
            </Section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: T.inkDim, marginBottom: 4 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Json({ value }: { value: unknown }) {
  return (
    <pre style={{ margin: 0, fontFamily: T.mono, fontSize: 10.5, color: T.inkMuted, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

const AXES = ["sweet", "sour", "bitter", "strong", "aromatic", "dilution"] as const;

function ToolResult({ toolName, output }: { toolName: string; output: unknown }) {
  const o = output as Record<string, unknown>;
  if (!o || typeof o !== "object") return <Json value={output} />;

  if (toolName === "check_balance" && o.balance) {
    const bal = o.balance as Record<string, number>;
    return (
      <div style={{ display: "grid", gap: 5 }}>
        <Row k="final ABV" v={`${Math.round(Number(o.final_abv) * 100)}%`} />
        <Row k="verdict" v={String(o.verdict)} color={o.verdict === "ok" ? T.green : T.amber} />
        {AXES.map((ax) => (
          <Bar key={ax} label={ax} value={bal[ax] ?? 0} />
        ))}
        {Array.isArray(o.issues) && o.issues.length
          ? (o.issues as string[]).map((iss) => (
              <div key={iss} style={{ color: T.amber, fontSize: 11 }}>
                ⚠ {iss}
              </div>
            ))
          : null}
      </div>
    );
  }

  if ((toolName === "top_pairings" || toolName === "flavor_similar")) {
    const list = (o.partners ?? o.alternatives) as { ref: string; score?: number; similarity?: number; why?: string }[];
    if (Array.isArray(list)) {
      return (
        <div style={{ display: "grid", gap: 4 }}>
          {list.slice(0, 8).map((p) => (
            <div key={p.ref} style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <EntityChip kind="product" id={p.ref} />
              <span style={{ color: T.inkDim, fontFamily: T.mono, fontSize: 10 }}>
                {(p.score ?? p.similarity ?? 0).toFixed(2)}
              </span>
              {p.why ? <span style={{ color: T.inkMuted, fontSize: 11 }}>{p.why}</span> : null}
            </div>
          ))}
        </div>
      );
    }
  }

  if (toolName === "flavor_profile" && o.found) {
    return (
      <div style={{ display: "grid", gap: 4 }}>
        {Array.isArray(o.descriptors) ? (
          <div style={{ color: T.ink }}>{(o.descriptors as string[]).join(" · ")}</div>
        ) : null}
        {o.role ? <Row k="role" v={String(o.role)} /> : null}
      </div>
    );
  }

  return <Json value={output} />;
}

function Row({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 11 }}>
      <span style={{ color: T.inkMuted, fontFamily: T.mono, minWidth: 64 }}>{k}</span>
      <span style={{ color: color ?? T.ink }}>{v}</span>
    </div>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ color: T.inkMuted, fontFamily: T.mono, fontSize: 10, minWidth: 56 }}>{label}</span>
      <div style={{ flex: 1, height: 4, background: T.surface2 }}>
        <div style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`, height: "100%", background: T.cyanDim }} />
      </div>
    </div>
  );
}
