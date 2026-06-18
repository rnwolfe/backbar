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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [threads, setThreads] = useState<{ id: string; title: string | null; updated_at: number }[]>([]);

  const loadThreads = () => {
    void fetch(`${apiBase}/ai/chat/threads`, { headers: authHeader() })
      .then((r) => (r.ok ? r.json() : []))
      .then((t) => Array.isArray(t) && setThreads(t))
      .catch(() => {});
  };
  const openHistory = () => {
    loadThreads();
    setHistoryOpen(true);
  };
  const selectThread = (id: string) => {
    setHistoryOpen(false);
    if (id !== threadId) {
      setMessages([]);
      setThreadId(id);
    }
  };

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
    setHistoryOpen(false);
    const id = newThreadId();
    setMessages([]);
    setThreadId(id);
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
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderBottom: `1px solid ${T.hairline}` }}>
        <img
          src="/agent-avatar.png"
          alt=""
          width={26}
          height={26}
          style={{ borderRadius: "50%", display: "block", border: `1px solid ${T.hairline2}` }}
        />
        <span style={{ color: T.ink, fontWeight: 600, fontSize: 14 }}>Backbar Agent</span>
        <span style={{ flex: 1 }} />
        <HeaderBtn onClick={historyOpen ? () => setHistoryOpen(false) : openHistory} title="Conversations" active={historyOpen}>
          chats
        </HeaderBtn>
        <HeaderBtn onClick={newChat} title="New chat">+ new</HeaderBtn>
        <HeaderBtn onClick={onClose} title="Close">✕</HeaderBtn>
      </div>

      {historyOpen ? (
        <ThreadList threads={threads} currentId={threadId} onSelect={selectThread} accent={A} />
      ) : (
        <>
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
        </>
      )}
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

function HeaderBtn({ children, onClick, title, active }: { children: React.ReactNode; onClick: () => void; title: string; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        background: active ? T.surface2 : "transparent",
        border: `1px solid ${active ? T.hairline2 : T.hairline2}`,
        color: active ? T.ink : T.inkMuted,
        fontFamily: T.mono,
        fontSize: 11,
        padding: "3px 7px",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function relTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function ThreadList({
  threads,
  currentId,
  onSelect,
  accent: A,
}: {
  threads: { id: string; title: string | null; updated_at: number }[];
  currentId: string;
  onSelect: (id: string) => void;
  accent: string;
}) {
  return (
    <div style={{ flex: 1, overflow: "auto", padding: 12, display: "grid", gap: 6, alignContent: "start" }}>
      <div style={{ color: T.inkMuted, fontFamily: T.mono, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 2 }}>
        Conversations
      </div>
      {threads.length === 0 ? (
        <div style={{ color: T.inkDim, fontSize: 12 }}>No saved conversations yet.</div>
      ) : (
        threads.map((t) => {
          const current = t.id === currentId;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t.id)}
              style={{
                textAlign: "left",
                padding: "8px 10px",
                background: current ? T.surface2 : T.surface,
                border: `1px solid ${current ? A : T.hairline2}`,
                color: T.ink,
                cursor: "pointer",
                display: "grid",
                gap: 3,
              }}
            >
              <span style={{ fontSize: 13, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.title || "Untitled chat"}
              </span>
              <span style={{ color: T.inkDim, fontFamily: T.mono, fontSize: 10 }}>{relTime(t.updated_at)}</span>
            </button>
          );
        })
      )}
    </div>
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
