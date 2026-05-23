export type LiveEvent =
  | { type: "hello"; ts: number }
  | {
      type: "reading.updated";
      bottle_id: string;
      level_ml: number;
      source: "manual" | "weight" | "pour";
      ts: number;
    }
  | {
      type: "makeable.changed";
      recipe_id: string;
      state: "makeable" | "one-away" | "unmakeable";
    }
  | {
      type: "node.status";
      device_id: string;
      status: "online" | "offline";
      last_seen: number | null;
    }
  | { type: "lowstock.crossed"; bottle_id: string; level_ml: number };

export type ConnState = "connecting" | "open" | "closed";

export interface LiveClient {
  close(): void;
}

function liveUrl(): string {
  const env = import.meta.env.VITE_LIVE_URL;
  if (env) return env;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/live`;
}

/**
 * Connect to /live with backoff reconnect. `onEvent` receives every parsed
 * event; `onState` reports the connection lifecycle so the top-bar dot can
 * reflect it. Returned client owns the timer + socket and tears both down.
 */
export function connectLive(
  onEvent: (e: LiveEvent) => void,
  onState: (s: ConnState) => void,
): LiveClient {
  let socket: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let backoff = 1000;

  const open = () => {
    onState("connecting");
    socket = new WebSocket(liveUrl());
    socket.onopen = () => {
      onState("open");
      backoff = 1000;
    };
    socket.onmessage = (m) => {
      try {
        onEvent(JSON.parse(m.data) as LiveEvent);
      } catch {
        // Unknown frame — ignore. Server is the only writer and we trust it.
      }
    };
    socket.onclose = () => {
      onState("closed");
      if (closed) return;
      timer = setTimeout(open, backoff);
      backoff = Math.min(backoff * 2, 30_000);
    };
    socket.onerror = () => socket?.close();
  };

  open();

  return {
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      socket?.close();
    },
  };
}
