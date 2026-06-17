/**
 * The agent dock — a persistent, context-aware chat that runs throughout the
 * console (right rail on desktop, full sheet on mobile). Streams an AI-SDK v5
 * UI message stream from `POST /ai/chat` over the operator token, renders tool
 * cards + entity chips + proposals, and persists the thread.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { apiBase } from "../api/client";
import { authHeader } from "../auth";
import { T, accent } from "../console/tokens";
import { useStore } from "../store/useStore";
import { useViewport } from "../util/useViewport";
import { Message } from "./Message";
import { ThinkingDots } from "./indicators";
import type { ChatContext } from "./types";

const THREAD_KEY = "backbar.chat.thread";
const newThreadId = () => `t-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

const SUGGESTIONS = [
  "What can I make right now?",
  "Design a stirred, bitter drink with what I have.",
  "I'm out of Cointreau — what can I substitute?",
  "Audit my library for unbalanced recipes.",
];

export function ChatDock({
  open,
  onClose,
  context,
  notify,
}: {
  open: boolean;
  onClose: () => void;
  context: ChatContext;
  notify: (m: string) => void;
}) {
  const tweaks = useStore((s) => s.tweaks);
  const A = accent(tweaks.accent).primary;
  const { isMobile } = useViewport();

  const [threadId, setThreadId] = useState<string>(
    () => localStorage.getItem(THREAD_KEY) ?? newThreadId(),
  );
  // Keep the latest context available to the transport without re-creating it.
  const contextRef = useRef(context);
  contextRef.current = context;

  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: `${apiBase}/ai/chat?thread=${encodeURIComponent(threadId)}`,
        headers: () => authHeader(),
        prepareSendMessagesRequest: ({ messages }) => ({
          body: { messages, context: contextRef.current },
        }),
      }),
    [threadId],
  );

  const { messages, sendMessage, status, stop, setMessages } = useChat({ id: threadId, transport });
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Persist the active thread id; hydrate its history on (re)open.
  useEffect(() => {
    localStorage.setItem(THREAD_KEY, threadId);
    let cancelled = false;
    void fetch(`${apiBase}/ai/chat/threads/${encodeURIComponent(threadId)}`, { headers: authHeader() })
      .then((r) => (r.ok ? r.json() : []))
      .then((m: UIMessage[]) => {
        if (!cancelled && Array.isArray(m) && m.length) setMessages(m);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [threadId, setMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  if (!open) return null;

  const send = (text: string) => {
    const t = text.trim();
    if (!t || status === "streaming" || status === "submitted") return;
    setInput("");
    void sendMessage({ text: t });
  };

  const newChat = () => {
    const id = newThreadId();
    setThreadId(id);
    setMessages([]);
  };

  const thinking = status === "submitted" || status === "streaming";

  return (
    <div
      style={
        isMobile
          ? { position: "fixed", inset: 0, top: 46, zIndex: 45, background: T.bg, display: "flex", flexDirection: "column" }
          : { position: "fixed", top: 46, right: 0, bottom: 0, width: 384, zIndex: 45, background: T.bg, borderLeft: `1px solid ${T.hairline2}`, display: "flex", flexDirection: "column" }
      }
    >
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: `1px solid ${T.hairline}` }}>
        <span style={{ color: A }}>✦</span>
        <span style={{ color: T.ink, fontWeight: 600, fontSize: 14 }}>Backbar Agent</span>
        <span style={{ flex: 1 }} />
        <HeaderBtn onClick={newChat} title="New chat">+ new</HeaderBtn>
        <HeaderBtn onClick={onClose} title="Close">✕</HeaderBtn>
      </div>

      {/* messages */}
      <div ref={scrollRef} style={{ flex: 1, overflow: "auto", padding: 12, display: "grid", gap: 14, alignContent: "start" }}>
        {messages.length === 0 ? (
          <Empty onPick={send} accent={A} />
        ) : (
          messages.map((m) => <Message key={m.id} message={m} notify={notify} />)
        )}
        {thinking && messages[messages.length - 1]?.role === "user" ? (
          <ThinkingDots label="thinking" />
        ) : null}
      </div>

      {/* composer */}
      <div style={{ borderTop: `1px solid ${T.hairline}`, padding: 10, display: "flex", gap: 8, alignItems: "flex-end" }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          placeholder="Ask the bar…"
          style={{
            flex: 1,
            resize: "none",
            maxHeight: 120,
            padding: "9px 10px",
            background: T.surface2,
            border: `1px solid ${T.hairline2}`,
            color: T.ink,
            fontFamily: T.body,
            fontSize: 13,
            outline: "none",
          }}
        />
        {thinking ? (
          <SendBtn accent={T.red} onClick={() => void stop()}>
            stop
          </SendBtn>
        ) : (
          <SendBtn accent={A} onClick={() => send(input)}>
            send
          </SendBtn>
        )}
      </div>
    </div>
  );
}

function Empty({ onPick, accent: A }: { onPick: (s: string) => void; accent: string }) {
  return (
    <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
      <div style={{ color: T.inkMuted, fontSize: 13, lineHeight: 1.5 }}>
        I can design drinks, check balance + makeability, suggest substitutions, pair with food, and
        curate your menu — grounded in your live bar.
      </div>
      {SUGGESTIONS.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onPick(s)}
          style={{
            textAlign: "left",
            padding: "8px 10px",
            background: T.surface,
            border: `1px solid ${T.hairline2}`,
            color: T.ink,
            fontSize: 12.5,
            cursor: "pointer",
          }}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

function HeaderBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{ background: "transparent", border: `1px solid ${T.hairline2}`, color: T.inkMuted, fontFamily: T.mono, fontSize: 11, padding: "3px 7px", cursor: "pointer" }}
    >
      {children}
    </button>
  );
}

function SendBtn({ children, onClick, accent: A }: { children: React.ReactNode; onClick: () => void; accent: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ background: A, color: T.bg, border: "none", fontFamily: T.mono, fontSize: 11, letterSpacing: "0.08em", padding: "9px 12px", cursor: "pointer", fontWeight: 600 }}
    >
      {children}
    </button>
  );
}
