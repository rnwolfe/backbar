-- Agentic chat threads (specs/ai-chat-spike.md §5). Persists UIMessage[] so a
-- conversation (text, tool calls, reasoning, proposals) survives reloads.

CREATE TABLE IF NOT EXISTS chat_thread (
  id         TEXT PRIMARY KEY,
  title      TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_message (
  id         TEXT PRIMARY KEY,
  thread_id  TEXT NOT NULL REFERENCES chat_thread(id) ON DELETE CASCADE,
  role       TEXT NOT NULL,
  parts      TEXT NOT NULL,            -- JSON: UIMessage.parts
  metadata   TEXT,                     -- JSON: UIMessage.metadata
  seq        INTEGER NOT NULL,         -- order within the thread
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_message_thread ON chat_message(thread_id, seq);
