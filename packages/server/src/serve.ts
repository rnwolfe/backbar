import type { ServerWebSocket } from "bun";
import type { App } from "./app";
import type { Deps } from "./deps";
import type { LiveEvent } from "./bus";
import { isAuthorized } from "./auth";
import { serveStatic, staticSurfacesFromEnv, type StaticSurface } from "./static";

/**
 * Which face of the app a request is hitting, decided by the `Host` header.
 * The guest host (`menu.*`) is public + read-only and may only reach
 * `/api/guest/*`; everything else is the operator console.
 */
type Surface = "operator" | "guest";

function surfaceFor(req: Request): Surface {
  const host = req.headers.get("host") ?? "";
  return host.startsWith("menu.") ? "guest" : "operator";
}

/** Rewrite `/api/foo` → `/foo`, preserving method, headers, body and query. */
function stripApiPrefix(req: Request, url: URL): Request {
  const next = new URL(req.url);
  next.pathname = url.pathname.replace(/^\/api/, "") || "/";
  const init: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers: req.headers,
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = req.body;
    init.duplex = "half"; // required when streaming a request body through
  }
  return new Request(next.toString(), init);
}

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

  const surfaces = staticSurfacesFromEnv();

  const server = Bun.serve<WSData, never>({
    port,
    fetch(req, srv) {
      const url = new URL(req.url);
      const surface: Surface = surfaceFor(req);

      // Live WebSocket — operator only, and token-gated when auth is on.
      if (url.pathname === "/live") {
        if (surface === "guest") return new Response("not found", { status: 404 });
        if (!isAuthorized(req)) return new Response("unauthorized", { status: 401 });
        const upgraded = srv.upgrade(req, {
          data: { pendingReadings: new Map(), flushTimer: null } satisfies WSData,
        });
        if (upgraded) return undefined as unknown as Response;
        return new Response("upgrade failed", { status: 400 });
      }

      // Health probe — always open (ops checks, post-restart smoke).
      if (url.pathname === "/healthz") return app.fetch(req);

      // API: `/api/*` → strip prefix → Hono, with per-surface gating.
      if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
        const stripped = stripApiPrefix(req, url);
        if (surface === "guest") {
          // Public host is hard-limited to the sanitized guest projection.
          const path = new URL(stripped.url).pathname;
          if (path !== "/guest" && !path.startsWith("/guest/")) {
            return new Response("forbidden", { status: 403 });
          }
        } else if (!isAuthorized(req)) {
          return new Response("unauthorized", { status: 401 });
        }
        return app.fetch(stripped);
      }

      // Everything else is a static asset / SPA route for this surface.
      const dist: StaticSurface = surface === "guest" ? surfaces.guest : surfaces.operator;
      return serveStatic(dist, url.pathname).then((res) => res ?? app.fetch(req));
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
