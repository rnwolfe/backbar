/**
 * Chat thread persistence — maps AI-SDK `UIMessage[]` ⇄ the chat_thread /
 * chat_message rows. We persist UIMessages (full parts: text, tool calls,
 * reasoning, proposals), never ModelMessages, so reloading restores the exact
 * rendered conversation (specs/ai-chat-spike.md §5).
 */
import type { UIMessage } from "ai";
import { chatMessages, chatThreads } from "@backbar/db";
import type { Deps } from "../deps";

/** First ~60 chars of the first user text part — a cheap thread title. */
function deriveTitle(messages: UIMessage[]): string | null {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return null;
  const text = firstUser.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join(" ")
    .trim();
  return text ? text.slice(0, 60) : null;
}

export function saveThread(deps: Deps, threadId: string, messages: UIMessage[]): void {
  const now = Date.now();
  chatThreads(deps.db).upsert({ id: threadId, title: deriveTitle(messages), updated_at: now });
  chatMessages(deps.db).replaceAll(
    threadId,
    messages.map((m) => ({
      id: m.id,
      role: m.role,
      parts: JSON.stringify(m.parts),
      metadata: m.metadata ? JSON.stringify(m.metadata) : null,
    })),
  );
}

export function loadThread(deps: Deps, threadId: string): UIMessage[] {
  // Defensive: a corrupted/legacy row must not crash the whole thread load.
  // Rows that fail to parse are skipped (a deeper option is the AI SDK's
  // `validateUIMessages` to handle tool-schema drift — a future hardening).
  const out: UIMessage[] = [];
  for (const row of chatMessages(deps.db).forThread(threadId)) {
    try {
      out.push({
        id: row.id,
        role: row.role as UIMessage["role"],
        parts: JSON.parse(row.parts),
        ...(row.metadata ? { metadata: JSON.parse(row.metadata) } : {}),
      });
    } catch {
      // skip the unparseable row
    }
  }
  return out;
}

export function listThreads(deps: Deps) {
  return chatThreads(deps.db)
    .list()
    .map((t) => ({ id: t.id, title: t.title, updated_at: t.updated_at }));
}

export function deleteThread(deps: Deps, threadId: string): void {
  chatThreads(deps.db).delete(threadId);
}
