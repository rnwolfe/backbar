/**
 * Render one UIMessage by switching on its `parts`. Text → RichText (with
 * entity chips), reasoning → dimmed collapsible, step-start → divider,
 * tool parts → ToolCard, and propose_* tool parts → ProposalCard.
 */
import { useState } from "react";
import type { UIMessage } from "ai";
import { T } from "../console/tokens";
import { ProposalCard } from "./ProposalCard";
import { RichText } from "./RichText";
import { ToolCard } from "./ToolCard";

type AnyPart = {
  type: string;
  text?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  toolName?: string;
};

export function Message({ message, notify }: { message: UIMessage; notify: (m: string) => void }) {
  const isUser = message.role === "user";
  const parts = message.parts as AnyPart[];

  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
      <div
        style={{
          maxWidth: isUser ? "85%" : "100%",
          width: isUser ? "auto" : "100%",
          display: "grid",
          gap: 8,
          padding: isUser ? "8px 11px" : 0,
          background: isUser ? T.surface2 : "transparent",
          border: isUser ? `1px solid ${T.hairline2}` : "none",
          color: T.ink,
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        {parts.map((part, i) => {
          if (part.type === "text" && part.text) return <RichText key={i} text={part.text} />;
          if (part.type === "reasoning" && part.text) return <Reasoning key={i} text={part.text} />;
          if (part.type === "step-start") return i > 0 ? <Divider key={i} /> : null;

          const toolName =
            part.type === "dynamic-tool"
              ? part.toolName
              : part.type.startsWith("tool-")
                ? part.type.slice(5)
                : null;
          if (toolName) {
            if (toolName.startsWith("propose_") && part.state === "output-available") {
              return <ProposalCard key={i} toolName={toolName} output={part.output} notify={notify} />;
            }
            if (toolName.startsWith("propose_")) return null; // proposal still streaming
            return (
              <ToolCard
                key={i}
                part={{ toolName, state: part.state ?? "", input: part.input, output: part.output, errorText: part.errorText }}
              />
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

function Reasoning({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ background: "none", border: "none", color: T.inkDim, fontFamily: T.mono, fontSize: 10, cursor: "pointer", padding: 0 }}
      >
        {open ? "▾ thinking" : "▸ thinking"}
      </button>
      {open ? (
        <div style={{ color: T.inkMuted, fontSize: 12, fontStyle: "italic", lineHeight: 1.5, marginTop: 4, whiteSpace: "pre-wrap" }}>
          {text}
        </div>
      ) : null}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: T.hairline, margin: "2px 0" }} />;
}
