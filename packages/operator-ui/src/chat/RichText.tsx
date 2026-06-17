/**
 * Minimal inline renderer for assistant text — no markdown dependency. Handles
 * the bits the agent actually emits: `[[kind:id]]` entity references → chips,
 * `**bold**`, `` `code` ``, and line breaks. Anything unmatched is plain text.
 */
import { Fragment, type ReactNode } from "react";
import { T } from "../console/tokens";
import { EntityChip } from "./EntityChip";
import type { EntityKind } from "./types";

const TOKEN = /\[\[(bottle|product|recipe):([a-z0-9][a-z0-9-]*)\]\]|\*\*([^*]+)\*\*|`([^`]+)`/g;

export function RichText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 ? <br /> : null}
          {renderLine(line)}
        </Fragment>
      ))}
    </>
  );
}

function renderLine(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  let key = 0;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex walk
  while ((m = TOKEN.exec(line)) !== null) {
    if (m.index > last) out.push(line.slice(last, m.index));
    if (m[1] && m[2]) {
      out.push(<EntityChip key={key++} kind={m[1] as EntityKind} id={m[2]} />);
    } else if (m[3] !== undefined) {
      out.push(
        <strong key={key++} style={{ color: T.ink, fontWeight: 600 }}>
          {m[3]}
        </strong>,
      );
    } else if (m[4] !== undefined) {
      out.push(
        <code
          key={key++}
          style={{ fontFamily: T.mono, fontSize: "0.9em", color: T.ink, background: T.surface2, padding: "0 3px" }}
        >
          {m[4]}
        </code>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}
