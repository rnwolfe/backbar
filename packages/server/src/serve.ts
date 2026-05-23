import type { ServerWebSocket } from "bun";
import type { App } from "./app";
import type { Deps } from "./deps";
import type { LiveEvent } from "./bus";

interface WSData {
  /** Per-connection coalescing for `reading.updated` bursts. */
  pendingReadings: Map<string, LiveEvent>;
  flushTimer: ReturnType<typeof setTimeout> | null;
}

const COALESCE_MS = 250;

/**
 * Start a Bun server that mounts the Hono app on every HTTP path and the
 * `/live` WebSocket on its own upgrade path.
 *
 * The Hono `app.fetch` adapter handles request → Response. WS broadcast
 * subscribes to the same bus the ingest core writes to, so REST writes →
 * bus event → every connected operator UI updates within a frame.
 *
 * `reading.updated` events are coalesced per bottle on a 250 ms window
 * (spec api.md §4 — settle detection at the node throttles upstream;
 * this is the server-side defense).
 */
export function serve(app: App, deps: Deps, port = Number(process.env.PORT ?? 8787)) {
  const sockets = new Set<ServerWebSocket<WSData>>();

  deps.bus.on((event) => {
    for (const ws of sockets) {
      if (event.type === "reading.updated") {
        ws.data.pendingReadings.set(event.bottle_id, event);
        if (!ws.data.flushTimer) {
          ws.data.flushTimer = setTimeout(() => {
            for (const e of ws.data.pendingReadings.values()) {
              ws.send(JSON.stringify(e));
            }
            ws.data.pendingReadings.clear();
            ws.data.flushTimer = null;
          }, COALESCE_MS);
        }
        continue;
      }
      ws.send(JSON.stringify(event));
    }
  });

  const server = Bun.serve<WSData, never>({
    port,
    fetch(req, srv) {
      const url = new URL(req.url);
      if (url.pathname === "/live") {
        const upgraded = srv.upgrade(req, {
          data: { pendingReadings: new Map(), flushTimer: null } satisfies WSData,
        });
        if (upgraded) return undefined as unknown as Response;
        return new Response("upgrade failed", { status: 400 });
      }
      return app.fetch(req);
    },
    websocket: {
      open(ws) {
        sockets.add(ws);
        ws.send(JSON.stringify({ type: "hello", ts: Date.now() }));
      },
      message(_ws, _msg) {
        // /live is broadcast-only; clients hydrate from REST then patch.
      },
      close(ws) {
        if (ws.data.flushTimer) clearTimeout(ws.data.flushTimer);
        sockets.delete(ws);
      },
    },
  });

  return server;
}
